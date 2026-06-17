# Copyright (c) 2026, BatchNepal and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DeskRailSettings(Document):
	def on_update(self):
		# bootinfo is cached; bust it so changes take effect on next desk load
		frappe.clear_cache()
