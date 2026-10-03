# Frontend

React SPA in `app/frontend/src`. Routes are in `root.tsx`: `/` (home), `/projects`, `/p/:slug` (workspace), `/ui-kit`.

## Folders

| Folder | Holds |
| --- | --- |
| `lib/` | API hooks per resource (`projects`, `architecture`, `conversation`, `knowledge`, `settings`, `me`), `api.ts` (`apiFetch`, `ApiError`), `auth.tsx`, `sse.ts` |
| `pages/` | Route components. `RequireUser` gates signed-in pages. |
| `architecture/` | Canvas (React Flow): `canvas.tsx` (Editor + Proposal review), `model.ts` (catalog, doc ↔ flow), `proposal.ts`, `autosave.ts`, `layout.ts` (dagre), `nodes.tsx`, `shapes.tsx`, `dock.tsx`, `inspector.tsx` |
| `conversation/` | Chat pane, markdown, Proposal card |
| `knowledge/` | Right-pane tabs (`side-panel.tsx`), Requirements, Decisions |
| `projects/`, `account/` | Sidebar, title, new-project form; Settings dialog |
| `ui/`, `design/` | Base components and StyleX tokens (the "design system") |

## Sign-in

- `AuthProvider` (`lib/auth.tsx`) tracks the Supabase session. `signIn('github' | 'google')` starts that provider's OAuth and returns to `/projects`.
- Sign-in lives on its own page, `/login` (`pages/login.tsx`): **Continue with GitHub** and **Continue with Google** as two equal outline buttons (neither is primary). The home page's **Get started** and the header's **Sign in** (hidden on `/login`) link to it with `ButtonRouteLink` (`ui/button.tsx`, a Button-styled router `Link`). Signed-in Users visiting `/login` go to `/projects`. Say "Google", never "Gmail".
- `RequireUser` (`pages/require-user.tsx`) explains the API's refusals. `identity_required`: "Sign in with GitHub or Google to continue". `not_allowed`: reads the identities from the error body (`refusedIdentities` in `lib/me.ts`, via `ApiError.body`) and tells a GitHub User to ask with their username and a Google User to send their Google id, which it shows in a `CopyValue` (`ui/copy-value.tsx`). A linked User sees both.
- `useMe()` returns `{displayName, avatarUrl}`. Avatars may come from GitHub or Google, so the production CSP (`Dockerfile`) admits `avatars.githubusercontent.com` and `lh3.googleusercontent.com`.

## Server state (TanStack Query)

Each hook reads its token from `useToken()` (`lib/auth.tsx`) and is `enabled` only when signed in. Project-scoped keys use `slugSuffix(slug)`, so they survive renames.

| Key | Hook | Notes |
| --- | --- | --- |
| `['projects']`, `['project', suffix]` | `useProjects`, `useProject` | Mutations set the single project and invalidate the list |
| `['architecture', suffix]` | `useArchitecture` | Read **once** per visit (`staleTime: ∞`, `gcTime: 0`). The canvas owns the document afterwards; never refetch it into an open canvas |
| `['messages', suffix]` | `useMessages` | Updated by `setQueryData` (send, reply `done`, Proposal status), not refetches. `usePendingProposal` derives from it |
| `['knowledge', suffix]` | `useKnowledge` | Invalidated after every knowledge edit, every canvas save (pruning) and every accept. Saving settings invalidates all `['knowledge']` |
| `['settings']`, `['me', token]` | `useSettings`, `useMe` | `useMe` keeps the previous profile while a refreshed token refetches; otherwise `RequireUser` would unmount the workspace (aborting a streaming reply) every hour |

## Workspace (`pages/workspace.tsx`)

Three panes: project sidebar, canvas, side panel (Conversation / Requirements / Decisions tabs; all stay mounted). Canvas-related components are keyed by slug suffix, so switching Projects remounts them with fresh state. The canvas publishes two things upward that the chat and the knowledge tabs consume:
- `Review`: the pending Proposal's accept/reject actions, staleness and progress.
- `names`: canvas id → display name.

### Canvas (`architecture/canvas.tsx`)

- `Editor` holds `{nodes, edges}` in state plus a `latest` ref. Every user edit goes through `update(nodes, edges, changed)`, which schedules autosave when `changed`. Display-only data (`diff`, `decisions`, `needsReview`) is added at render and never saved. `fromFlow` drops it.
- Component Types: `model.ts` `COMPONENT_TYPES` (labels, property fields) and `shapes.tsx` `LOOKS` (icon + outline). Both must match the Go catalog.

### Autosave (`architecture/autosave.ts`)

- Debounced 1s PUT with the base version. On 409 it enters `conflict` and stops for good; the User must reload. Other errors keep the edits pending.
- Unmount flushes with `keepalive` when the body fits the browser's 64 KiB keepalive limit, and with a plain fetch otherwise; `beforeunload` warns while a save is pending.
- `commit(document, send)` waits for the in-flight save, then sends through a different endpoint and adopts the version it returns. Accepting a Proposal uses it, so canvas saves and accepts never race.

### Proposal review (`useProposalReview` + `architecture/proposal.ts`)

- `staleReason`: the Proposal references a component or connection that is no longer on the canvas → it can't be accepted.
- `previewProposal` draws the result with added/changed/removed markers. New components are placed by dagre relative to the existing layout (existing components never move). Positions are remembered per `seq`, so accepting lands them exactly where previewed.
- Accept: `applyProposal` → `autosave.commit` → `POST …/accept` → `setProposalStatus` + refresh knowledge. A `not_pending` error refreshes messages. The canvas is locked for the whole accept (`locked` drops edits in `update`; React Flow dragging, connecting and deleting are off), because the accept sends the canvas as it was when the User clicked: an edit made meanwhile would be lost or, saved afterwards, undo the Proposal.
- Mirror of the server's ids: `p{seq}-{ref}` / `p{seq}-k{index}`. Keep it in sync with `proposal.ComponentID` / `ConnectionID`.

### Chat (`conversation/chat-pane.tsx`, `lib/conversation.ts`)

- Send = `POST messages`, then `useReply().start()`, which streams `POST reply` through `readEvents` (fetch + manual SSE parsing, because the request needs an `Authorization` header).
- On `done`, the reply is appended to the cache and any pending Proposal is marked `superseded`, mirroring the server.
- The server saves a completed reply even if the client went away. So when a stream ends without `done` or `error` (the connection dropped), or `POST reply` answers `nothing_to_reply`, the chat reloads `['messages', suffix]` instead of only offering a retry.
- When the User reviews the pending Proposal that ends the Conversation, the chat starts a reply automatically. Reviews from before page load only get a "Get a reply" button.

## Styling

- StyleX only (`stylex.create`, compiled; no runtime fallback). Use token roles from `design/tokens.stylex.ts` (`color['--color-fg']`, `space[…]`, `media.lg`), never raw values.
- New base components go in `src/ui/` and must be shown on `/ui-kit` (`pages/ui-kit.tsx`).
- Icons: `lucide-react`. Toasts: `react-toastify` via `ui/toaster.tsx`.

## Tests

- Vitest + Testing Library: `renderWithQuery(ui, { route, auth: signedIn() })`, `mockApi({ 'GET /api/…': body | {status, body} | fn })` (unmatched requests throw), `sseResponse(...)` for replies, `<LocationProbe />` for navigation. All in `src/test/render.tsx`.
- E2E in `e2e/*.spec.ts`, using `test` from `e2e/fixtures.ts` (`signIn({ provider, page })`, default GitHub, returns the identity's display `name` and provider `id`), against the real API with `AI_FAKE=1`. Playwright builds and runs its own API and Vite on dedicated ports (`e2e/servers.ts`: 18080/15173), so it never reuses a `make dev` server that would call the real model. A second API on 18081 admits nobody; not-allowed tests reroute their API calls to it with `page.route`.
- `demo/workspace.capture.ts` (`make demo-screenshots`) regenerates the home page screenshots. It is not a test suite.
