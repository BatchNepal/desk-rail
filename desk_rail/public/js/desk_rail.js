/**
 * Desk Rail — a persistent workspace navigation rail and instant-redirect
 * navigation for the Frappe / ERPNext desk.
 *
 * Copyright (c) 2026, BatchNepal — GNU AGPL v3 (see license.txt)
 */

(function () {
	// ---- phase 1: zero-latency synchronous layout lock -------------------
	const cfg = (window.frappe && window.frappe.boot && window.frappe.boot.desk_rail) || {};
	if (!cfg.enabled) return;

	document.documentElement.style.setProperty("--dr-rail-w", (cfg.rail_width || 274) + "px");
	if (cfg.full_width_navbar) document.documentElement.classList.add("dr-fullwidth-navbar");
	if (cfg.hide_list_filter_bar) document.documentElement.classList.add("dr-hide-filterbar");

	// Pre-emptively suppress native sidebar frame lines and reserve custom rail space
	let lockStyle = null;
	if (cfg.replace_native_sidebar) {
		document.documentElement.classList.add("dr-rail-active");
		lockStyle = document.createElement("style");
		lockStyle.id = "dr-preemptive-layout-lock";
		lockStyle.innerHTML = `
			.desk-sidebar, [data-page-route="Workspaces"] .layout-side-section { display: none !important; }
			.dr-rail.dr-rail-shell-loading {
				position: fixed; top: 0; left: 0; bottom: 0; z-index: 101;
				width: var(--dr-rail-w); background: var(--bg-base, #fff);
				border-right: 1px solid var(--border-color, #e2e8f0);
			}
			body.dr-rail-collapsed .dr-rail.dr-rail-shell-loading { display: none !important; }
		`;
		(document.head || document.documentElement).appendChild(lockStyle);
	}

	// ---- phase 2: structural placeholder shell insertion -----------------
	function mountStructuralShell() {
		if (!cfg.replace_native_sidebar || document.querySelector(".dr-rail")) return;
		const target = document.querySelector(".main-section") || document.body;
		if (!target) {
			// High frequency frame catch loop to mount before next browser paint
			requestAnimationFrame(mountStructuralShell);
			return;
		}
		const shell = document.createElement("div");
		shell.className = "dr-rail dr-rail-shell-loading";
		shell.innerHTML = `<nav class="dr-rail-nav"></nav>`;
		target.appendChild(shell);
	}
	mountStructuralShell();

	// ---- phase 3: asynchronous lifecycle data hydration ------------------
	frappe.after_ajax(function () {
		const REDIRECTS = (frappe.boot && frappe.boot.redirect_workspaces) || {};
		const LS_COLLAPSED = "desk_rail:collapsed";
		const LS_EXPANDED = "desk_rail:expanded";
		let applying = false;

		function releaseLayoutLock() {
			if (lockStyle && lockStyle.parentNode) {
				lockStyle.parentNode.removeChild(lockStyle);
			}
			const shell = document.querySelector(".dr-rail");
			if (shell) shell.classList.remove("dr-rail-shell-loading");
		}

		function purgeCustomRail() {
			const shell = document.querySelector(".dr-rail");
			if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
			document.documentElement.classList.remove("dr-rail-active");
			document.body.classList.remove("dr-rail-active");
			releaseLayoutLock();
		}

		// ---- soft (SPA) vs hard navigation ------------------------------------
		function isSoftTarget(url) {
			try {
				const u = new URL(url, window.location.origin);
				return u.origin === window.location.origin && u.pathname.startsWith("/app/");
			} catch (e) {
				return false;
			}
		}

		function navigate(url) {
			if (isSoftTarget(url)) {
				const u = new URL(url, window.location.origin);
				frappe.set_route(u.pathname.replace(/^\/app\//, "") + u.search + u.hash);
			} else {
				window.location.href = url;
			}
		}

		if (cfg.full_width_navbar) document.body.classList.add("dr-fullwidth-navbar");
		if (cfg.hide_list_filter_bar) document.body.classList.add("dr-hide-filterbar");

		// ---- native sidebar fallback observer --------------------------------
		function applyNativeRedirects() {
			Object.entries(REDIRECTS).forEach(([name, url]) => {
				if (!url) return;
				const anchor = document.querySelector(
					`.sidebar-item-container[item-name="${name}"] .item-anchor`
				);
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
			new MutationObserver(applyNativeRedirects).observe(sidebar, {
				childList: true,
				subtree: true,
			});
		})();

		if (!cfg.replace_native_sidebar) {
			purgeCustomRail();
			return;
		}

		// ---- state & collapse toggles -----------------------------------------
		function setCollapsed(collapsed) {
			document.body.classList.toggle("dr-rail-collapsed", collapsed);
			document.documentElement.classList.toggle("dr-rail-collapsed", collapsed);
			try {
				localStorage.setItem(LS_COLLAPSED, collapsed ? "1" : "0");
			} catch (e) {}
		}

		function initCollapsed() {
			let v = null;
			try {
				v = localStorage.getItem(LS_COLLAPSED);
			} catch (e) {}
			if (v === null) {
				v = cfg.default_collapsed_on_mobile && window.matchMedia("(max-width: 768px)").matches ? "1" : "0";
			}
			document.body.classList.toggle("dr-rail-collapsed", v === "1");
			document.documentElement.classList.toggle("dr-rail-collapsed", v === "1");
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
			btn.innerHTML = frappe.utils.icon("menu", "md");
			btn.addEventListener("click", () =>
				setCollapsed(!document.body.classList.contains("dr-rail-collapsed"))
			);
			container.insertBefore(btn, brand);
		}

		// ---- rail layout components & nesting engine --------------------------
		function railTarget(page) {
			const r = REDIRECTS[page.title] || REDIRECTS[page.name];
			if (r) return r;
			const slug = frappe.router.slug(page.title);
			return "/app/" + (page.public ? slug : "private/" + slug);
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
					open.push(g.querySelector(":scope > .dr-rail-item").dataset.name);
				}
			});
			try {
				localStorage.setItem(LS_EXPANDED, JSON.stringify(open));
			} catch (e) {}
		}

		function toggleGroup(group, force, persist) {
			const panel = group.querySelector(":scope > .dr-rail-children");
			if (!panel) return;
			const open = force !== undefined ? force : panel.classList.contains("hidden");
			panel.classList.toggle("hidden", !open);
			const use = group.querySelector(":scope > .dr-rail-item .dr-rail-arrow use");
			if (use) use.setAttribute("href", open ? "#icon-es-line-up" : "#icon-es-line-down");
			if (persist !== false) saveExpanded(group.closest(".dr-rail-nav"));
		}

		async function hydrateRail() {
			let rail = document.querySelector(".dr-rail");
			let nav = rail ? rail.querySelector(".dr-rail-nav") : null;

			// If data hydration has already run or is currently in flight, skip execution
			if ((nav && nav.children.length > 0) || window.dr_rail_fetching) {
				releaseLayoutLock();
				return;
			}

			let data;
			try {
				window.dr_rail_fetching = true;
				data = await frappe.xcall("frappe.desk.desktop.get_workspace_sidebar_items");
			} catch (e) {
				purgeCustomRail();
				return;
			} finally {
				window.dr_rail_fetching = false;
			}

			const pages = (data && data.pages) || [];
			if (!pages.length) {
				purgeCustomRail();
				return;
			}

			// Safeguard: re-catch rail references if layout cleanups mutated them
			if (!rail || !nav) {
				const main = document.querySelector(".main-section") || document.body;
				if (!main) return;
				rail = document.createElement("div");
				rail.className = "dr-rail";
				nav = document.createElement("nav");
				nav.className = "dr-rail-nav";
				rail.appendChild(nav);
				main.appendChild(rail);
			}

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
					a.innerHTML =
						`<span class="dr-rail-icon">${frappe.utils.icon(p.icon || "folder-normal", "md")}</span>` +
						`<span class="dr-rail-label">${frappe.utils.escape_html(__(p.title))}</span>`;

					if (kids.length) {
						const arrow = document.createElement("button");
						arrow.className = "btn-reset dr-rail-arrow";
						arrow.innerHTML = frappe.utils.icon("es-line-down", "sm");
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

			nav.addEventListener("click", (e) => {
				if (e.target.closest(".dr-rail-item") && !e.target.closest(".dr-rail-arrow")) {
					if (window.matchMedia("(max-width: 768px)").matches) setCollapsed(true);
				}
			});

			document.body.classList.add("dr-rail-active");
			releaseLayoutLock();

			let saved = [];
			try {
				saved = JSON.parse(localStorage.getItem(LS_EXPANDED) || "[]");
			} catch (e) {}
			applying = true;
			eachGroup(nav, (g) => {
				if (saved.includes(g.querySelector(":scope > .dr-rail-item").dataset.name)) {
					toggleGroup(g, true, false);
				}
			});
			applying = false;

			function updateActive() {
				const here = window.location.pathname.replace(/\/+$/, "");
				let best = null;
				let bestLen = -1;
				nav.querySelectorAll(".dr-rail-item").forEach((a) => {
					a.classList.remove("active");
					let ap;
					try {
						ap = new URL(a.dataset.href, location.origin).pathname.replace(/\/+$/, "");
					} catch (e) {
						return;
					}
					if (here === ap || here.startsWith(ap + "/")) {
						if (ap.length > bestLen) {
							best = a;
							bestLen = ap.length;
						}
					}
				});
				if (best) {
					best.classList.add("active");
					applying = true;
					let parent = best.closest(".dr-rail-group").parentElement.closest(".dr-rail-group");
					while (parent) {
						toggleGroup(parent, true, false);
						parent = parent.parentElement.closest(".dr-rail-group");
					}
					applying = false;
				}
			}
			updateActive();
			frappe.router.on("change", updateActive);
		}

		initCollapsed();
		injectNavToggle();
		hydrateRail();
	});
})();
