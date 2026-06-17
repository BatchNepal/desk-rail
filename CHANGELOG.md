# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-06-17

Initial public release.

### Added
- Persistent left navigation **rail** mounted on the desk shell, surviving
  navigation across workspace, list, report and form views.
- **Soft SPA navigation** for internal `/app/*` targets; hard navigation for
  external, cross-origin, or filtered URLs.
- **Instant-redirect workspaces** via two Workspace custom fields
  (`instant_redirect`, `redirect_url`), shipped as fixtures.
- **Persistent show/hide** toggle to the left of the navbar logo, remembered
  per user.
- Nested workspace groups with persisted expansion and active-route
  auto-expand/highlight.
- Responsive off-canvas behaviour on small screens.
- **Desk Rail Settings** single doctype to toggle every behaviour
  (rail width, native-sidebar replacement, navbar toggle, full-width navbar,
  list filter-bar hiding, mobile default).
- Graceful degradation to the stock Frappe sidebar when disabled or on failure.

[Unreleased]: https://github.com/BatchNepal/desk-rail/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BatchNepal/desk-rail/releases/tag/v0.1.0
