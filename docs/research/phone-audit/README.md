# Phone-width audit (2026-10-03)

Throwaway output of `app/frontend/e2e/phone-audit.spec.ts` on the `audit/phone-width` branch, for
[Audit every page at phone width](https://github.com/rodgons/sys-helper/issues/50). Every page was
captured at 375px and 768px (`<page>-<width>.png`, plus `-full.png` for the whole scroll height).
`findings.json` holds the raw measurements:

- `overflow`: elements wider than the viewport.
- `smallTargets`: controls under 44×44 (Apple's guideline; WCAG 2.2 AA asks only for 24×24).
- `smallInputs`: fields under 16px, which iOS zooms into on focus.
- `tinyText`: text under 12px.

Chromium with touch emulation only. The iOS focus-zoom and keyboard behaviour still need a real
iPhone.

| Page | Sideways scroll | What breaks |
| --- | --- | --- |
| Home (visitor) | no | No Sign in below 48rem: the action hides and the menu lists only Home, so "Get started" is the only way in. |
| Login | no | Nothing. |
| Projects (signed in) | no | No account menu below 48rem (no Settings, no Sign out). The Project name field is 14px. Create project is 32px tall. |
| Workspace | **yes** (1036px document) | The `64rem` grid plus the notice. Inside it: the Rename/Delete row, zoom controls 26px, dock 36px, Accept/Reject 32px, composer 14px, long Project names clipped. Covered by the compact layout. |
| UI kit | no | The shared `TextField`, `TextArea` and `SelectField` are all 14px, so every form inherits the iOS zoom. |

At every width: the theme button is 32×32, the site-header Menu/Close is 36px tall, and the mono
eyebrow labels are 11px (a deliberate style; still legible).
