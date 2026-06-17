/**
 * Desk Rail Settings Form Script
 * Copyright (c) 2026, BatchNepal — GNU AGPL v3 (see license.txt)
 */

frappe.ui.form.on("Desk Rail Settings", {
	after_save: function (frm) {
		frappe.msgprint({
			message: __("Desk Rail configuration updated. Please refresh the browser to apply layout metrics changes."),
			indicator: "green",
			title: __("Settings Saved")
		});
	}
});
