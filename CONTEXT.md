# sys-helper

A workspace where a user designs a software system's architecture on a canvas while an AI guides them through the design and explains the reasoning behind it.

## Language

### Workspace

**User**:
A person who signs in with their GitHub account. GitHub is used only to establish identity.
_Avoid_: Account, member

**Project**:
A system the User intends to build. It owns exactly one Architecture, one Conversation, and its Requirements.
_Avoid_: Repo, workspace, board

**Project Slug**:
The public, URL-friendly identifier of a Project: its current name followed by a random suffix (e.g. `url-shortener-k3xa9q2m7p`). The suffix is assigned once and never changes, and it alone identifies the Project. The name part follows renames and is cosmetic.
_Avoid_: Project ID (that is the internal identifier, never shown to Users), handle

### Architecture

**Architecture**:
The system design drawn on a Project's canvas, made up of Components and Connections.
_Avoid_: Design system (that term is reserved for the app's own UI tokens and components), diagram, system design

**Component**:
One element of an Architecture, such as a Load Balancer, Database, or Queue. Every Component has a Component Type.
_Avoid_: Node, box, block

**Component Type**:
An entry in the fixed catalog of known kinds of Component, such as Client, CDN, Load Balancer, Service, Database, Cache, Queue, or Object Store. Each type defines the properties a Component of that type can have.
_Avoid_: Node type, shape

**Custom Component**:
A Component whose kind is not in the catalog. The User or the AI describes it in free text.

**Connection**:
A directed link between two Components, such as a request flow or data flow.
_Avoid_: Edge, arrow, link

### Reasoning

**Conversation**:
The chat between the User and the AI inside a Project. It is made up of Messages.
_Avoid_: Chat, thread, session

**Welcome Message**:
The fixed first Message of every new Conversation. It tells the User the AI will ask about what they want to build and ends with the first question.

**Requirement**:
A stated need or constraint of the Project that design choices answer to, such as expected users, read/write ratio, latency target, consistency needs, or budget. It has a category (Scale, Performance, Availability, Consistency, Security, Cost, Constraints or Functional) and a one-line statement, and is numbered R1, R2, … within its Project.
_Avoid_: Spec, constraint, NFR

**Experience Level**:
How experienced the User says they are, recorded per Project: Beginner, Intermediate or Expert. It sets how deeply the AI explains its Decisions.
_Avoid_: Skill level, persona

**Decision**:
A recorded design choice: a title, the rationale, the pattern it applies, the main alternative it rejected, and the Requirements it cites. It is attached to one or more Components or Connections, records whether the User or the AI wrote it, and is numbered D1, D2, … within its Project. It is deleted once none of the items it is attached to remain.
_Avoid_: Rationale, note, explanation

**Needs Review**:
The flag a Decision gets when a Requirement it cites changes or is removed. The User clears it by confirming the Decision is still valid, or by editing or deleting it.

**Proposal**:
A set of changes that the AI suggests: to the Architecture, and to the Requirements, Decisions and Experience Level that come with them. A Proposal can change Requirements alone. The User accepts or rejects it as a whole. A Project has at most one pending Proposal. The AI changes the Architecture only through Proposals.
_Avoid_: Suggestion, patch, diff

**Stale Proposal**:
A pending Proposal that no longer applies because the User changed the Architecture after the AI made it. A Stale Proposal can't be accepted.
