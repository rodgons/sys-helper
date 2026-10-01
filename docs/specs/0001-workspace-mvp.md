# Spec 0001: Workspace MVP

Status: accepted (2026-09-30). Vocabulary is defined in [`CONTEXT.md`](../../CONTEXT.md); terms in **bold** below are glossary terms.

## Goal

A **User** signs in with GitHub and opens a **Project**. They design its **Architecture** on a canvas, either by hand or through a **Conversation** with an AI. The AI asks for **Requirements**, suggests changes as **Proposals**, and explains every choice as a **Decision** that cites the Requirements behind it.

## Pages

- **`/` (home page, public):** a hero, "how it works" in three steps (describe → the AI asks → an Architecture with reasons) and a "Sign in with GitHub" button. Signed-in Users are redirected to their most recent Project, or to an empty state if they have none. This page is fully responsive.
- **`/p/:slug` (workspace):** three panes.
  - **Left:** the User's Projects (collapsible).
  - **Middle:** the React Flow canvas.
  - **Right:** the Conversation.

  The workspace is desktop-first and shows a "best on desktop" notice below 1024px.
- **`/ui-kit`:** the existing reference page for the UI components (previously `/system-design`).

## Projects

- A Project is created with a name only. It can be renamed and deleted, and deleting asks for confirmation.
- A Project owns exactly one Architecture, one Conversation, its Requirements and the User's **Experience Level**.
- **Project Slug:** `<normalized-name>-<suffix>`, like Medium's article URLs.
  - The suffix is 10 characters of `a-z0-9`. The server generates it with `crypto/rand` and stores it in its own unique column. If it collides, the server retries. The suffix never changes.
  - Name normalization: lowercase, accents removed, anything non-alphanumeric becomes `-`, at most 40 characters. If nothing usable is left, the slug is just the suffix.
  - The full slug is built from the current name, never stored. Lookups use only the suffix, and a stale or wrong name part redirects to the canonical slug.
- The primary key is a UUIDv7. UUIDs never leave the server. The browser and API routes use only slugs (`/api/projects/{suffix}`).

## Architecture

- Built from **Components** and **Connections**.
- **Component Types**:
  - Client
  - DNS
  - CDN
  - Load Balancer
  - API Gateway
  - Service
  - Database (properties: engine, replicas, sharding)
  - Cache
  - Queue/Stream
  - Object Store
  - Search Index
  - External Service
  - Custom (described in free text)
- **Connections** have a type (`sync`, `async` or `replication`) and an optional label.
- Stored as one JSON document per Project with a version number. Manual edits autosave about 1s after the User stops editing. The version number detects **Stale Proposals** and edits from two tabs.

## Conversation and the AI

- Every new Conversation starts with a fixed **Welcome Message**, inserted when the Project is created with no AI call. It explains that the AI will ask questions about what the User wants to build, and ends with "What are you building, and who is it for?"
- The AI asks for missing Requirements and the User's Experience Level, and adjusts the depth of its explanations to that level. Every AI Decision names the pattern it uses and the main alternative it rejected.
- **Proposals:**
  - The AI changes the Architecture only through Proposals, which can also carry Decisions and Requirements.
  - At most one Proposal can be pending per Project, and the User accepts or rejects it as a whole.
  - While pending, the Proposal shows on the canvas as a diff overlay: added Components are green ghosts, removed ones are red and faded, and changed ones are highlighted. Accept and Reject buttons appear in the chat and in a floating canvas bar.
  - The User can keep editing while a Proposal is pending. If an edit conflicts with the Proposal, it becomes stale and can't be accepted. The User can ask the AI to redo it.
  - On accept, dagre places only the new Components and leaves existing positions untouched.
- **Decisions:**
  - A Decision becomes real only when its Proposal is accepted. Users can also write their own.
  - Each Decision records whether the User or the AI wrote it, and is attached to Components and/or Connections.
  - When a cited Requirement changes, the Decision is flagged "needs review".
- **Requirements** can be edited through the chat (via Proposals) or directly in a panel.
- Each turn, the AI receives the system prompt, the current Architecture, all Requirements, all Decisions and the last N Messages. It doesn't react on its own to manual edits.
- Replies stream over SSE, and a Proposal appears once the reply finishes. On a model error or timeout, the chat shows an error with a Retry button, and no partial assistant Message is saved.

## Backend

- **Auth:** Supabase Auth with the GitHub provider. The Go API checks the Supabase JWT on every request and scopes all data by user ID. GitHub is used only for identity.
- **Access control:** an optional allowlist of GitHub usernames (empty means anyone can sign in) and a daily per-User message cap, both set in `.env`.
- **AI:**
  - The Go API calls an NVIDIA (build.nvidia.com) OpenAI-compatible endpoint behind a `ChatModel` interface. The base URL, model and key come from `.env`.
  - Only models that support tool calling are allowed. Tool calls are how the AI produces Proposals, Decisions and Requirements.
- **Storage:** the Architecture is a JSON document, and Messages, Proposals, Decisions and Requirements are relational tables.

## Testing

- **Unit tests** use a fake `ChatModel` that returns scripted tool calls.
- **Integration tests** run against real Postgres.
- **E2E tests** run against the real API with the fake model switched on by an env flag. They never call NVIDIA.

## Out of scope for the MVP

- Importing or reading GitHub repositories
- Multiple Architectures or version history per Project
- The AI reacting on its own to manual edits
- A mobile workspace layout
- Production hosting (decided later; development runs against local Supabase)

## Delivery slices

Each slice is built test-first and can ship on its own.

1. **React migration.** (done) Preact → React (ADR 0001), `/system-design` → `/ui-kit`, add a router.
2. **Auth.** (done) Supabase GitHub sign-in, JWT middleware, allowlist, home page and the redirect for signed-in Users.
3. **Projects.** (done) Migration (UUIDv7, `slug_suffix`), CRUD API, slug lookup and redirects, sidebar and empty state.
4. **Canvas, manual editing only.** (done) Component Type catalog, Connections, the Architecture document with its version number, and autosave.
5. **Conversation without AI.** (done) Messages, the Welcome Message on creation, and the chat pane.
6. **Model connection.** (done) `ChatModel`, the NVIDIA client, the fake model, SSE, Retry and the daily cap.
7. **Proposals.** Tool calls, the diff overlay, accept/reject, dagre placement and stale detection.
8. **Requirements and Decisions.** The Requirements panel, Experience Level, Decisions linked to Components and Connections, and the "needs review" flag.
