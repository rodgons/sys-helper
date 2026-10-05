# Frontend

React SPA in `app/frontend/src`. Routes are in `root.tsx`: `/` (home), `/projects`, `/p/:slug` (workspace), `/ui-kit`.

## Folders

| Folder | Holds |
| --- | --- |
| `lib/` | API hooks per resource (`projects`, `architecture`, `conversation`, `knowledge`, `explanations`, `settings`, `me`), `api.ts` (`apiFetch`, `ApiError`), `auth.tsx`, `sse.ts` |
| `pages/` | Route components. `RequireUser` gates signed-in pages. |
| `architecture/` | Canvas (React Flow): `canvas.tsx` (Editor + Proposal review), `model.ts` (catalog, doc ↔ flow), `history.ts` (undo and redo), `proposal.ts`, `autosave.ts`, `layout.ts` (dagre), `nodes.tsx`, `shapes.tsx`, `dock.tsx`, `inspector.tsx` |
| `conversation/` | Chat pane, markdown, Proposal card |
| `knowledge/` | Right-pane tabs (`side-panel.tsx`), Requirements, Decisions, Pattern and Component Type explanations |
| `projects/`, `account/` | Sidebar, title (and its rename and delete dialogs), new-project form, the compact workspace bar and Project drawer; the account menu; Settings dialog (default Experience Level, and Delete account behind a second confirmation, which signs out on success) |
| `ui/`, `design/` | Base components and StyleX tokens (the "design system") |

## Sign-in

- `AuthProvider` (`lib/auth.tsx`) tracks the Supabase session. `signIn('github' | 'google')` starts that provider's OAuth and returns to `/projects`. The client uses the PKCE flow (`lib/supabase.ts`): the redirect carries a one-time `?code=`, never tokens in the URL.
- Sign-in lives on its own page, `/login` (`pages/login.tsx`): **Continue with GitHub** and **Continue with Google** as two equal outline buttons (neither is primary). The home page's **Get started** and the header's **Sign in** (hidden on `/login`) link to it with `ButtonRouteLink` (`ui/button.tsx`, a Button-styled router `Link`). Signed-in Users visiting `/login` go to `/projects`. Say "Google", never "Gmail".
- `RequireUser` (`pages/require-user.tsx`) explains the API's refusals. `identity_required`: "Sign in with GitHub or Google to continue". `not_allowed`: reads the identities from the error body (`refusedIdentities` in `lib/me.ts`, via `ApiError.body`) and tells a GitHub User to ask with their username and a Google User to send their Google id, which it shows in a `CopyValue` (`ui/copy-value.tsx`). A linked User sees both.
- The site header (`ui/site-header.tsx`, filled in by `root.tsx`) shows the theme menu and then the account menu (`account/account-menu.tsx`: the avatar, with Settings and Sign out) or, for visitors, **Sign in**, at every width. Below `md` the page links move into the **Menu**, which holds only page links: visitors get Home, signed-in Users (no links) get no Menu.
- `useMe()` returns `{displayName, avatarUrl}`. Avatars may come from GitHub or Google, so the production CSP (`Dockerfile`) admits `avatars.githubusercontent.com` and `lh3.googleusercontent.com`.

## Server state (TanStack Query)

Each hook reads its token from `useToken()` (`lib/auth.tsx`) and is `enabled` only when signed in. Project-scoped keys use `slugSuffix(slug)`, so they survive renames. Keys aren't scoped to the User, so `main.tsx` clears the whole cache when a session ends (`AuthProvider`'s `onSignedOut`).

| Key | Hook | Notes |
| --- | --- | --- |
| `['projects']`, `['project', suffix]` | `useProjects`, `useProject` | Mutations set the single project and invalidate the list |
| `['architecture', suffix]` | `useArchitecture` | Read **once** per visit (`staleTime: ∞`, `gcTime: 0`). The canvas owns the document afterwards; never refetch it into an open canvas |
| `['messages', suffix]` | `useMessages` | Updated by `setQueryData` (send, reply `done`, Proposal status, New Conversation), not refetches. `usePendingProposal` derives from it |
| `['knowledge', suffix]` | `useKnowledge` | Invalidated after every knowledge edit, every canvas save (a save changes which Decisions are shown: those whose items are off the canvas are hidden) and every accept. Saving settings invalidates all `['knowledge']` |
| `['explanations']` | `useExplanations` (`lib/explanations.ts`) | The global catalog of Pattern and Component Type explanations: `staleTime: ∞`, never invalidated |
| `['settings']`, `['me', token]` | `useSettings`, `useMe` | `useMe` keeps the previous profile while a refreshed token refetches; otherwise `RequireUser` would unmount the workspace (aborting a streaming reply) every hour |

## Workspace (`pages/workspace.tsx`)

Three panes on desktop: project sidebar, canvas, side panel (Conversation / Requirements / Decisions tabs; all stay mounted). Compact screens get one column instead (below). Canvas-related components are keyed by slug suffix, so switching Projects remounts them with fresh state. The canvas publishes two things upward that the chat and the knowledge tabs consume:
- `Review`: the pending Proposal's accept/reject actions, staleness and progress.
- `names`: canvas id → display name.

### Compact layout (below 64rem)

- **One tier:** everything below `media.lg` (phones and portrait tablets) is compact; 64rem and up is desktop. `COMPACT_QUERY` (`design/breakpoints.ts`, `(max-width: 63.99rem)`) names it in JS, and a test ties it to `media.lg`. `useCompact()` (`lib/compact.ts`) reads it through `matchMedia` and `useSyncExternalStore`, so every consumer flips together.
- **`useCompact()` drives behaviour and tier-only chrome** (canvas props, where the Inspector renders, the sheet or the resizer and rails, the sidebar). Tier-only chrome holds no important state. Sizing and placement stay in StyleX media keys.
- **One tree:** the canvas and the side panel keep their place in the React tree on both tiers (chrome that only one tier has renders `null` in its slot), so crossing the breakpoint never remounts them: the chat draft, a streaming reply (the reply hook aborts on unmount) and unsaved canvas edits survive. Never render a second workspace tree.
- **Bottom sheet** (`knowledge/bottom-sheet.tsx`): the side panel docks under the canvas, which shrinks to fit above it. It is never an overlay, and the canvas is never in a scrolling or CSS-transformed box (React Flow's handle offsets break). Its handle is a horizontal window splitter (`separator` "Resize panel", `aria-valuetext` Peek/Half/Full): dragging snaps to the nearest of **peek** (76px: handle and tab row), **half** (50%) and **full** (all but 56px); a tap or Enter toggles peek and half; the arrow keys, Home and End step. The sheet draws its own tab row (`PanelTabs`, with the counts, the Needs Review dot and a pending-Proposal dot) and renders `SidePanel` `bare` with a controlled `tab`; a tab tapped at peek opens half.
- **Workspace bar** (`projects/workspace-bar.tsx`): on `/p/:slug` in the compact layout, Root leaves out the site header and the workspace fills `100dvh` under one 56px bar (the page's banner): ☰ "Projects" opens the drawer; the Project name is the `h1`, on one line with an ellipsis; a ⋯ "Project actions" menu opens `RenameProjectDialog` (follows the new slug) and `DeleteProjectDialog` (confirms, then goes to Projects with a toast), both from `projects/project-title.tsx`, in place of the inline rename form; then the account menu. Every other page keeps the site header.
- **Project drawer** (`projects/project-drawer.tsx`): a modal native `<dialog>` named Projects (focus trap, Esc), anchored left, `min(20rem, 85vw)` wide and full height, sliding in. It lists the Projects (rows at least 48px, the current one `aria-current`), New project (closes the drawer and opens the new-project dialog) and a footer with the logo (a link home) and the theme menu (`placement="above"`), clear of the bottom safe area. It closes on ✕, a backdrop tap, Esc, a swipe left, picking any Project (the current one too) and any navigation.
- **Keyboard and viewport:** the viewport meta (`index.html`) has `interactive-widget=resizes-content`, so on Android `dvh` shrinks with the on-screen keyboard and the sheet's composer stays above it with no JS. iOS Safari supports neither that nor the VirtualKeyboard API and pans the visual viewport instead, so on compact `useKeyboardHeight` (`lib/keyboard.ts`) sizes the workspace shell to `visualViewport.height` and undoes the pan by scrolling the window back to the top (translating the shell by `offsetTop` is the alternative, if a real iPhone prefers it). It does nothing without `visualViewport` or while the page is pinch-zoomed. Playwright can't open a virtual keyboard, so check this on devices. Never add `maximum-scale`/`user-scalable=no`: 16px fields (see Styling) are what stop the focus-zoom.
- **What resets** (`useWorkspaceView` in `workspace.tsx`): opening a Project starts on the Conversation with the sheet at half (not remembered); crossing the breakpoint puts the sheet at half and keeps the tab (the drawer, being compact-only chrome, simply goes); a Proposal arriving while the sheet is full drops it to half, so its preview shows. The side-panel width keeps its own storage.

### Side panel width (`lib/panel-width.ts`)

- The User resizes the side panel by dragging the border between it and the canvas (pointer events with pointer capture; `resizing` on `<main>` sets the resize cursor and blocks text selection), or from the keyboard: the border is a focusable vertical `separator` ("Resize panel", `aria-valuenow`/`min`/`max` in px). Arrow keys step 1rem, Home/End jump to the bounds and a double-click resets to the default 24rem. The width applies to all three tabs, because it is the grid's `--right-w`.
- Bounds: min 20rem; max keeps the canvas at least 32rem wide beside the left pane's current width (16rem open, 3rem rail, the `LEFT_*_REM` constants in `workspace.tsx`), within the panes' 64rem minimum. `usePanelWidth` keeps the chosen width and clamps only what it shows, so it re-clamps when the window resizes or the sidebar toggles, and a window that grows back restores the choice.
- Stored per browser in `localStorage` (`side-panel-width`, px), never on the server. Like the theme, reads and writes are guarded: a missing, non-numeric, out-of-bounds or blocked value falls back to 24rem. Collapsing the panel to its rail keeps the width; reopening restores it.

### Canvas (`architecture/canvas.tsx`)

- `Editor` holds `{nodes, edges}` in state plus a `latest` ref. Every user edit goes through `update(nodes, edges, changed)`, which schedules autosave when `changed`. Display-only data (`diff`, `decisions`, `needsReview`, `dimmed`) is added at render and never saved. `fromFlow` drops it.
- Spotlight (`model.ts` `spotlight`): while anything is selected, everything it doesn't touch is `dimmed`. That means the selection, a selected Component's Connections and their other ends, and a selected Connection's two ends. It runs on what is shown, so a Proposal preview's new and removed Connections count. Dimmed items stay fully interactive.
- Component window: a click selects a Component, and clicking it again while it is the only selection opens its Inspector beside it (`opened`). A Component added from the dock opens straight away. Closing the window, or the first Esc, keeps the selection and the spotlight. The next Esc clears both.
- Component Types: `model.ts` `COMPONENT_TYPES` (labels, property fields) and `shapes.tsx` `LOOKS` (icon + outline). Both must match the Go catalog.

- **Undo and redo** (`history.ts`, `History`): steps for one visit, in memory only. The Editor holds one `History` for its life, so a reload or a Project switch starts empty. Up to 100 steps (the oldest drops); a new step clears redo.
  - **Steps** are snapshots of the canvas before an edit, plus a label from the call site that knows the intent: "Move Database", "Move 3 components", "Add Cache", "Delete Database", "Delete connection", "Connect API → Database", "Edit Database", "Edit connection", "Tidy up", "Accept Proposal #3". The arrays are replaced immutably, so snapshots share structure.
  - **One recording point:** `update(nodes, edges, edit)` records every `edit` (an `Edit`: label, optional `run` and `before`) unless an undo or redo is replaying. Selection, measuring, panning, zooming and the Proposal preview pass `false` and never make a step.
  - **Grouping:** a drag's moves show as they happen, but its step starts from the canvas when the drag began (`dragStart`). Backspace deletes in two React Flow batches (Connections, then Components); `onBeforeDelete` opens one step for both (`deleting`) and `onDelete` closes it. Typing in one Inspector field of one item merges into one step (`run` = item and field) until the field blurs (`onEditEnd` → `endRun`), another field or item is edited, or anything else records, undoes or redoes. No idle timer.
  - **Undo/redo** puts the snapshot back through `update` as an edit, so autosave saves it, then selects what the step added or changed that still exists (or nothing), pans to centre it without zooming if none of it is in view (`useShow`, shared with `usePanIntoView`), and never opens the Inspector (one already open on the only item changed stays). It is disabled while a review is being sent or the canvas is locked for an accept, and once autosave is in `conflict`.
  - **Controls:** Undo and Redo (lucide `Undo2`/`Redo2`) in React Flow's control group before Tidy up: the vertical stack on desktop, the compact row beside Fit and Tidy up at 44px. Tooltip "Undo Delete Database (⌘Z)" / "Redo … (⇧⌘Z)", Ctrl+Z and Ctrl+Y off macOS; accessible name "Undo Delete Database"; just "Undo (⌘Z)" with nothing to undo.
  - **Shortcuts** (a `window` keydown listener for the Editor's life): ⌘Z/Ctrl+Z undo; ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y redo. Ignored when the target is inside an input, text area, select or content-editable element, which keeps its own undo (the Inspector, the chat composer, the Requirement and Decision editors).
  - **Flash:** for 1.5s (`FLASH_MS`) after an undo or redo, the canvas shows the preview's markers for the step (`stepChanges` before → after, drawn by `flashed`): added and changed (moved or edited) items outlined with "· new"/"· changed", removed ones as faded struck-through ghosts that can't be selected, dragged or connected. Any edit ends it. A Proposal preview wins: while one is shown there is no flash.
  - **Announcement:** "Undid …"/"Redid …" in a visually hidden `aria-live="polite"` div beside the save indicator. Not a second `status`: tests expect exactly one.
- **Compact canvas** (`sheet` prop, a `CompactSheet`): the workspace passes it only in the compact layout.
  - Components aren't draggable, so one finger pans anywhere and two pinch; no multi-select or box selection (`multiSelectionKeyCode`/`selectionKeyCode` null). Taps still select.
  - One tap on a Component or Connection selects it and opens the Inspector (`sheet.onOpenChange(true)`), with no "click it again" hint. The canvas portals the Inspector (`inSheet`) into `sheet.host`, a box in the sheet under its tab row that replaces the (still mounted, hidden) tab content; never the node or edge toolbar. ✕, Esc or a tab tap close it and keep the selection; a tap on the pane closes it and clears the selection; once nothing (or several things) is selected it closes itself. Remove ("Delete component"/"Delete connection") is the delete path; Backspace and Esc still work with a keyboard.
  - Opening the Inspector moves the sheet from peek or full to half (`useWorkspaceView`); closing leaves it. Once the sheet settles, `usePanIntoView` centres the selected item if the sheet now covers it.
  - The controls drop zoom in/out and keep Fit and Tidy up. Fit has no Inspector space: 16px at the sides and top, 64px at the bottom (104px with the Proposal bar), `minZoom` 0.25. Tune on a device.
  - **"+ Add"** (`ComponentPicker` in `dock.tsx`) replaces the dock's icon row: one button opening a grid (`dialog` "Add component", three columns of icon and label) above it, closing on a pick, a backdrop tap or Esc. A pick adds the Component at the centre of the view, selects it and opens its Inspector in the sheet without focusing a field, so the keyboard stays down. The desktop dock (drag and tap) is unchanged.
  - **Proposal banner** (`CompactProposalBar`): one line, "Proposal #N", the summary clipped, Accept and Reject; a short second line when it is out of date ("Out of date. Ask the AI to redo it.", Accept disabled) or the review failed. The chat's Proposal card keeps the full summary.
  - Tap-to-connect (React Flow's default) is the best-effort way to draw Connections. On `pointer: coarse` the handles grow to 24px. The control buttons are 44px on the compact canvas (`compact-controls`) and on `pointer: coarse` (`global.css`, since StyleX can't reach React Flow's own buttons).

### Autosave (`architecture/autosave.ts`)

- Undo and redo save like any other edit.
- Debounced 1s PUT with the base version. On 409 it enters `conflict` and stops for good; the User must reload. Other errors keep the edits pending.
- Unmount flushes with `keepalive` when the body fits the browser's 64 KiB keepalive limit, and with a plain fetch otherwise; `beforeunload` warns while a save is pending.
- `commit(document, send)` waits for the in-flight save, then sends through a different endpoint and adopts the version it returns. Accepting a Proposal uses it, so canvas saves and accepts never race.

### Proposal review (`useProposalReview` + `architecture/proposal.ts`)

- `staleReason`: the Proposal references a component or connection that is no longer on the canvas → it can't be accepted. Staleness and the preview derive from the current canvas, so they follow undo and redo both ways: an undo can make a Proposal out of date, and a redo makes it acceptable again.
- `previewProposal` draws the result with added/changed/removed markers. New components are placed by dagre relative to the existing layout (existing components never move). Positions are remembered per `seq`, so accepting lands them exactly where previewed.
- Accept: `applyProposal` → `autosave.commit` → `POST …/accept` → `setProposalStatus` + refresh knowledge. Only then is it recorded as one undo step, "Accept Proposal #N" (`onAccepted`); a failed accept records nothing. Undoing it is a canvas edit only: the Proposal stays Accepted, and its card, Requirements and Experience Level don't change. A `not_pending` error refreshes messages. The canvas is locked for the whole accept (`locked` drops edits in `update`; React Flow dragging, connecting and deleting are off), because the accept sends the canvas as it was when the User clicked: an edit made meanwhile would be lost or, saved afterwards, undo the Proposal.
- Mirror of the server's ids: `p{seq}-{ref}` / `p{seq}-k{index}`. Keep it in sync with `proposal.ComponentID` / `ConnectionID`.

### Chat (`conversation/chat-pane.tsx`, `lib/conversation.ts`)

- Send = `POST messages`, then `useReply().start()`, which streams `POST reply` through `readEvents` (fetch + manual SSE parsing, because the request needs an `Authorization` header).
- On `done`, the reply is appended to the cache and any pending Proposal is marked `superseded`, mirroring the server.
- The server saves a completed reply even if the client went away. So when a stream ends without `done` or `error` (the connection dropped), or `POST reply` answers `nothing_to_reply`, the chat reloads `['messages', suffix]` instead of only offering a retry.
- When the User reviews the pending Proposal that ends the Conversation, the chat starts a reply automatically. Reviews from before page load only get a "Get a reply" button.
- **New Conversation:** the ghost icon button at the top of the Conversation tab asks in a `Dialog`, then `useNewConversation` POSTs `…/conversation` and **replaces** `['messages', suffix]` with the response (no refetch). Everything derived from the pending Proposal (canvas preview, review, auto-reply) follows by itself. On success the chat calls `useReply().reset()` (a stale Retry goes away), resets the send error and the Up/Down recall, and keeps the draft. `busy` → a toast, nothing changes. The button is disabled while a reply streams, a message sends, a review (`Review.busy`) or the reset is in flight, and when the Conversation is only the Welcome Message.

### Explanations (`knowledge/explanation.tsx`)

- `PatternText` shows a pattern as written and, when it has a `patternId` the catalog knows, a native `<details>` "What is <Pattern>?" under it. It renders on the side panel's Decision card, the Inspector's condensed Decision card (a single Pattern line) and each `add_decision` line of the Proposal card ("… · <pattern>"). `ComponentTypeExplanation` puts "What is <type>?" under the Inspector's header for every Component Type but Custom. Connections get none.
- Inside: the gist, a `tablist` "Explain for" with Beginner, Intermediate and Expert, a `tabpanel` rendered by the chat's `Markdown`, and "Read more" (new tab). The tabs follow the Project's level, marked "· yours", until the User picks one (Intermediate when none is recorded), so an explanation opened before the level loads, or before an accept records it, still lands on it.
- While the catalog loads, or if it fails, patterns stay plain and nothing errors. The Decision form's pattern field suggests the Pattern names through a `<datalist>`; any text is still allowed.

## Styling

- StyleX only (`stylex.create`, compiled; no runtime fallback). Use token roles from `design/tokens.stylex.ts` (`color['--color-fg']`, `space[…]`, `media.lg`), never raw values.
- **Touch sizing** (`media.coarse`, `@media (pointer: coarse)`, at every width, iPads in landscape included): the shared `TextField`, `TextArea`, `SelectField` and the chat composer use `--text-md` (16px), so iOS doesn't zoom on focus; icon buttons (theme, ✕, pane toggles, the header Menu, any `Menu` trigger such as the avatar), `sm` Buttons and menu items are at least 44×44. Links inside running text are exempt, and the 11px eyebrow labels and 10px chat metadata don't change. Mouse users keep 14px fields and the smaller controls. Write it as `{ default: …, [media.coarse]: … }`.
- New base components go in `src/ui/` and must be shown on `/ui-kit` (`pages/ui-kit.tsx`).
- Icons: `lucide-react`. Toasts: `react-toastify` via `ui/toaster.tsx`.

### Theme (`lib/theme.ts`, `ui/theme-menu.tsx`)

- Every color token is `light-dark(light, dark)`, so it follows `color-scheme`: `light dark` (the OS) by default. Add new colors the same way; never key a token on `prefers-color-scheme`.
- The User picks System, Light or Dark in the header's `ThemeMenu`, to the left of the avatar and at every width. The choice lives in `localStorage` (`theme`) only. A forced one sets `<html data-theme>`, which `global.css` turns into `color-scheme`; System removes it.
- `public/theme-init.js` applies the stored choice before the first paint. It is a blocking external script because the CSP (`script-src 'self'`) forbids inline ones. `useThemeChoice()` reads `data-theme`, so the two never disagree.
- Anything that picks a scheme outside CSS follows the choice: React Flow's `colorMode`, the home page screenshot (the `<source media>` only when System) and the two `theme-color` metas, retargeted with `media="all"`/`"not all"`.

## Tests

- `setCompact(true | false)` (`src/test/render.tsx`) puts a test in the compact or desktop layout by stubbing `matchMedia` (the test DOM evaluates no media queries); calling it mid-test crosses the breakpoint. `setup.ts` resets it to desktop before each test.
- Vitest + Testing Library: `renderWithQuery(ui, { route, auth: signedIn() })`, `mockApi({ 'GET /api/…': body | {status, body} | fn })` (unmatched requests throw), `sseResponse(...)` for replies, `<LocationProbe />` for navigation. All in `src/test/render.tsx`.
- E2E in `e2e/*.spec.ts`, using `test` from `e2e/fixtures.ts` (`signIn({ provider, page })`, default GitHub, returns the identity's display `name` and provider `id`), against the real API with `AI_FAKE=1`. Playwright builds and runs its own API and Vite on dedicated ports (`e2e/servers.ts`: 18080/15173), so it never reuses a `make dev` server that would call the real model. A second API on 18081 admits nobody; not-allowed tests reroute their API calls to it with `page.route`.
- Playwright has two projects. `chromium` (desktop) runs every spec except `*.mobile.spec.ts`; `mobile` (Chromium at 390×844 with `hasTouch` and `isMobile`, so `pointer: coarse` matches and the compact layout applies) runs only `*.mobile.spec.ts`. The test DOM evaluates no media queries, so touch sizes (16px fields, 44×44 targets) are measured there (`e2e/touch-sizing.mobile.spec.ts`).
- `demo/workspace.capture.ts` (`make demo-screenshots`) regenerates the home page screenshots. It is not a test suite.
