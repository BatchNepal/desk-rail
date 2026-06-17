import frappe


def boot_session(bootinfo):
	"""Inject Desk Rail config + the instant-redirect map into the desk bootinfo."""
	bootinfo.desk_rail = get_settings()
	bootinfo.redirect_workspaces = get_redirect_workspaces()


def get_settings():
	"""Return the effective Desk Rail Settings as a plain dict for the client."""
	try:
		doc = frappe.get_cached_doc("Desk Rail Settings")
	except Exception:
		# settings not migrated yet — fall back to sane defaults
		return _defaults()

	return {
		"enabled": bool(doc.enabled),
		"replace_native_sidebar": bool(doc.replace_native_sidebar),
		"rail_width": int(doc.rail_width or 274),
		"show_navbar_toggle": bool(doc.show_navbar_toggle),
		"full_width_navbar": bool(doc.full_width_navbar),
		"hide_list_filter_bar": bool(doc.hide_list_filter_bar),
		"default_collapsed_on_mobile": bool(doc.default_collapsed_on_mobile),
	}


def _defaults():
	return {
		"enabled": True,
		"replace_native_sidebar": True,
		"rail_width": 274,
		"show_navbar_toggle": True,
		"full_width_navbar": True,
		"hide_list_filter_bar": False,
		"default_collapsed_on_mobile": True,
	}


def get_redirect_workspaces():
	"""Map of {workspace_name: redirect_url} for workspaces flagged instant_redirect."""
	if not frappe.db.has_column("Workspace", "instant_redirect"):
		# custom fields not installed yet (pre-migrate)
		return {}
	rows = frappe.get_all(
		"Workspace",
		filters={"instant_redirect": 1},
		fields=["name", "redirect_url"],
	)
	return {r.name: r.redirect_url for r in rows if r.redirect_url}
