/**
 * Desk Rail — a persistent workspace navigation rail and instant-redirect
 * navigation for the Frappe / ERPNext desk.
 *
 * Copyright (c) 2026, BatchNepal — GNU AGPL v3 (see license.txt)
 *
 * Design goals: load once, stable. The layout (rail width + content offset +
 * hidden native sidebar) is committed to <html> SYNCHRONOUSLY before first
 * paint, so nothing shifts afterwards. There is deliberately NO opacity masking
 * or route-transition observer — Frappe's own page rendering is left untouched,
 * which is what keeps loads flicker-free.
 */

(function () {
	"use strict";

	const boot = window.frappe && window.frappe.boot;
	const cfg = (boot && boot.desk_rail) || {};
	if (!cfg.enabled) return;

	const LS_COLLAPSED = "desk_rail:collapsed";
	const LS_EXPANDED = "desk_rail:expanded";

	// ── resolve collapsed state synchronously (so the offset is right at paint)
	let collapsed = false;
	try {
		const s = localStorage.getItem(LS_COLLAPSED);
		if (s === "1") collapsed = true;
		else if (s === null && cfg.default_collapsed_on_mobile &&
			window.matchMedia("(max-width: 768px)").matches) collapsed = true;
	} catch (e) {}

	// ── phase 1: lock layout on <html> before first paint (zero shift) ──────
	const root = document.documentElement;
	root.style.setProperty("--dr-rail-w", (cfg.rail_width || 274) + "px");
	root.classList.add("dr-rail-active");
	if (collapsed) root.classList.add("dr-rail-collapsed");
	if (cfg.full_width_navbar) root.classList.add("dr-fullwidth-navbar");
	if (cfg.hide_list_filter_bar) root.classList.add("dr-hide-filterbar");
	if (cfg.replace_native_sidebar) root.classList.add("dr-replace-sidebar");

	// ── phase 2: mount the (empty) rail box ASAP, so it never pops in ───────
	function mountRail() {
		if (!cfg.replace_native_sidebar || document.querySelector(".dr-rail")) return;
		const main = document.querySelector(".main-section");
		if (!main) return void requestAnimationFrame(mountRail);
		const rail = document.createElement("div");
		rail.className = "dr-rail";
		rail.innerHTML = '<nav class="dr-rail-nav"></nav>';
		main.appendChild(rail);
	}
	mountRail();

	// ── phase 3: hydrate once the desk's pending boot requests settle.
	//    after_ajax is a ONE-SHOT (frappe/request.js) — it runs the fn once when
	//    in-flight requests drain, NOT on every later save/list-refresh. Firing
	//    after the native sidebar's own fetch also means we hit a warm
	//    get_workspace_sidebar_items rather than a cold call. ──
	frappe.after_ajax(function () {
		const REDIRECTS = (frappe.boot && frappe.boot.redirect_workspaces) || {};
		let applying = false;
		let fetched = false;

		// keep body classes in sync with <html> for any body-scoped CSS
		["dr-rail-active", "dr-fullwidth-navbar", "dr-hide-filterbar", "dr-replace-sidebar"]
			.forEach((c) => { if (root.classList.contains(c)) document.body.classList.add(c); });
		document.body.classList.toggle("dr-rail-collapsed", collapsed);

		// ---- navigation (soft for internal /app, hard otherwise) -----------
		function isSoftTarget(url) {
			try {
				const u = new URL(url, window.location.origin);
				return u.origin === window.location.origin && u.pathname.startsWith("/app/");
			} catch (e) { return false; }
		}
		function navigate(url) {
			if (isSoftTarget(url)) {
				const u = new URL(url, window.location.origin);
				frappe.set_route(u.pathname.replace(/^\/app\//, "") + u.search + u.hash);
			} else {
				window.location.href = url;
			}
		}

		// ---- redirect workspaces on the native sidebar (fallback) ----------
		function applyNativeRedirects() {
			Object.entries(REDIRECTS).forEach(([name, url]) => {
				if (!url) return;
				const anchor = document.querySelector(
					`.sidebar-item-container[item-name="${name}"] .item-anchor`);
				if (anchor && !anchor.dataset.drBound) {
					anchor.dataset.drBound = "1";
					anchor.setAttribute("href", url);
					anchor.addEventListener("click", (e) => {
						e.preventDefault();
						e.stopImmediatePropagation();
						navigate(url);
					}, true);
				}
			});
		}
		(function watchNativeSidebar() {
			const sidebar = document.querySelector(".desk-sidebar");
			if (!sidebar) return void setTimeout(watchNativeSidebar, 300);
			applyNativeRedirects();
			new MutationObserver(applyNativeRedirects)
				.observe(sidebar, { childList: true, subtree: true });
		})();

		if (!cfg.replace_native_sidebar) return;

		// ---- collapse toggle -----------------------------------------------
		function setCollapsed(c) {
			collapsed = c;
			root.classList.toggle("dr-rail-collapsed", c);
			document.body.classList.toggle("dr-rail-collapsed", c);
			try { localStorage.setItem(LS_COLLAPSED, c ? "1" : "0"); } catch (e) {}
		}
		function injectNavToggle() {
			if (!cfg.show_navbar_toggle || document.querySelector(".dr-rail-toggle")) return;
			const container = document.querySelector(".navbar .container");
			const brand = container && container.querySelector(".navbar-brand");
			if (!container || !brand) return void setTimeout(injectNavToggle, 300);
			const btn = document.createElement("button");
			btn.className = "btn-reset dr-rail-toggle";
			btn.setAttribute("aria-label", "Toggle sidebar");
			btn.title = "Toggle sidebar";
			btn.innerHTML = (frappe.utils && frappe.utils.icon)
				? frappe.utils.icon("menu", "md") : "&#9776;";
			btn.addEventListener("click", () => setCollapsed(!collapsed));
			container.insertBefore(btn, brand);
		}

		// ---- rail tree -----------------------------------------------------
		function railTarget(p) {
			const r = REDIRECTS[p.title] || REDIRECTS[p.name];
			if (r) return r;
			const slug = frappe.router.slug(p.title);
			return "/app/" + (p.public ? slug : "private/" + slug);
		}
		function eachGroup(nav, fn) {
			nav.querySelectorAll(".dr-rail-group").forEach((g) => {
				const panel = g.querySelector(":scope > .dr-rail-children");
				if (panel) fn(g, panel);
			});
		}
		function saveExpanded(nav) {
			const open = [];
			eachGroup(nav, (g, panel) => {
				if (!panel.classList.contains("hidden")) {
					const item = g.querySelector(":scope > .dr-rail-item");
					if (item && item.dataset.name) open.push(item.dataset.name);
				}
			});
			try { localStorage.setItem(LS_EXPANDED, JSON.stringify(open)); } catch (e) {}
		}
		function toggleGroup(group, force, persist) {
			const panel = group.querySelector(":scope > .dr-rail-children");
			if (!panel) return;
			const open = force !== undefined ? force : panel.classList.contains("hidden");
			panel.classList.toggle("hidden", !open);
			// rotate the chevron via CSS (no sprite dependency) — see .dr-open in css
			group.classList.toggle("dr-open", open);
			if (persist !== false) {
				const nav = group.closest(".dr-rail-nav");
				if (nav) saveExpanded(nav);
			}
		}

		async function hydrate() {
			const rail = document.querySelector(".dr-rail");
			const nav = rail && rail.querySelector(".dr-rail-nav");
			if (!nav || nav.children.length || fetched) return;

			let data;
			try {
				fetched = true;
				data = await frappe.xcall("frappe.desk.desktop.get_workspace_sidebar_items");
			} catch (e) {
				// give up gracefully — drop the rail, restore stock desk
				if (rail) rail.remove();
				root.classList.remove("dr-rail-active");
				document.body.classList.remove("dr-rail-active");
				return;
			}
			const pages = (data && data.pages) || [];
			if (!pages.length) return;

			const byParent = {};
			pages.forEach((p) => {
				const k = p.parent_page || "";
				(byParent[k] = byParent[k] || []).push(p);
			});

			(function renderInto(parentKey, container, depth) {
				(byParent[parentKey] || []).forEach((p) => {
					if (p.is_hidden) return;
					const kids = (byParent[p.title] || []).filter((c) => !c.is_hidden);

					const group = document.createElement("div");
					group.className = "dr-rail-group";

					const href = railTarget(p);
					const a = document.createElement("a");
					a.className = "dr-rail-item";
					a.href = href;
					a.dataset.name = p.title;
					a.dataset.href = href;
					a.style.paddingLeft = 12 + depth * 14 + "px";
					const icon = (frappe.utils && frappe.utils.icon)
						? frappe.utils.icon(p.icon || "folder-normal", "md") : "";
					const label = (frappe.utils && frappe.utils.escape_html)
						? frappe.utils.escape_html(__(p.title)) : p.title;
					a.innerHTML =
						`<span class="dr-rail-icon">${icon}</span>` +
						`<span class="dr-rail-label">${label}</span>`;

					if (kids.length) {
						const arrow = document.createElement("button");
						arrow.className = "btn-reset dr-rail-arrow";
						// self-contained chevron (Lucide chevron-down) — rotated via CSS,
						// never swapped, so it can't reference a missing sprite symbol
						arrow.innerHTML =
							'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
							'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
							'aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
						arrow.addEventListener("click", (e) => {
							e.preventDefault();
							e.stopPropagation();
							toggleGroup(group);
						});
						a.appendChild(arrow);
					}
					a.addEventListener("click", (e) => {
						e.preventDefault();
						navigate(href);
					});

					group.appendChild(a);
					if (kids.length) {
						const childWrap = document.createElement("div");
						childWrap.className = "dr-rail-children hidden";
						group.appendChild(childWrap);
						renderInto(p.title, childWrap, depth + 1);
					}
					container.appendChild(group);
				});
			})("", nav, 0);

			// collapse the overlay rail after tapping a link on mobile
			nav.addEventListener("click", (e) => {
				if (e.target.closest(".dr-rail-item") && !e.target.closest(".dr-rail-arrow")) {
					if (window.matchMedia("(max-width: 768px)").matches) setCollapsed(true);
				}
			});

			// restore expanded groups
			let saved = [];
			try { saved = JSON.parse(localStorage.getItem(LS_EXPANDED) || "[]"); } catch (e) {}
			applying = true;
			eachGroup(nav, (g) => {
				const item = g.querySelector(":scope > .dr-rail-item");
				if (item && saved.includes(item.dataset.name)) toggleGroup(g, true, false);
			});
			applying = false;

			// active-route highlight (longest same-origin path match)
			function updateActive() {
				const here = window.location.pathname.replace(/\/+$/, "");
				let best = null, bestLen = -1;
				nav.querySelectorAll(".dr-rail-item").forEach((a) => {
					a.classList.remove("active");
					let ap;
					try { ap = new URL(a.dataset.href, location.origin).pathname.replace(/\/+$/, ""); }
					catch (e) { return; }
					if ((here === ap || here.startsWith(ap + "/")) && ap.length > bestLen) {
						best = a; bestLen = ap.length;
					}
				});
				if (best) {
					best.classList.add("active");
					applying = true;
					let parent = best.closest(".dr-rail-group").parentElement.closest(".dr-rail-group");
					while (parent) { toggleGroup(parent, true, false); parent = parent.parentElement.closest(".dr-rail-group"); }
					applying = false;
				}
			}
			updateActive();
			if (frappe.router && frappe.router.off) frappe.router.off("change", updateActive);
			frappe.router.on("change", updateActive);
		}

		injectNavToggle();
		hydrate();
	});
})();
