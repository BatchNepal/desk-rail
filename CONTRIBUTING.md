# Contributing to Desk Rail

Thanks for your interest in improving Desk Rail! This is a small, focused app —
contributions that keep it that way (non-invasive, settings-driven, no core
patches) are especially welcome.

## Ground rules

- **No Frappe core edits.** Everything must live in this app — desk-shell JS/CSS,
  bootinfo, fixtures, and the settings doctype. If a change can only be done by
  patching Frappe, it doesn't belong here.
- **Keep it optional.** New behaviours should be a toggle in *Desk Rail Settings*
  and default to the least-surprising value.
- **Degrade gracefully.** If the rail can't build, the user must still have a
  working stock sidebar.

## Development setup

```bash
bench get-app https://github.com/BatchNepal/desk-rail
bench --site your-site.local install-app desk_rail
bench build --app desk_rail && bench --site your-site.local clear-cache
```

Edit the assets in `desk_rail/public/`, rebuild with `bench build --app desk_rail`,
and hard-refresh the desk.

## Code style

- Python: [ruff](https://docs.astral.sh/ruff/) (config in `pyproject.toml`), tabs.
- JS/CSS: tabs, double-quoted strings, mirror the existing style.
- Run `pre-commit install` once; hooks will lint/format on commit.

## Pull requests

1. Fork and branch from `main` (`feature/…` or `fix/…`).
2. Keep PRs scoped to one change; update `CHANGELOG.md` under *Unreleased*.
3. Describe the behaviour before/after and how you verified it (a screenshot or
   GIF for UI changes goes a long way).
4. By contributing, you agree your work is licensed under the project's AGPL-3.0.

## Reporting bugs

Open an issue with your Frappe/ERPNext version, browser, the relevant
*Desk Rail Settings*, and steps to reproduce. The bug-report template will prompt
you for these.
