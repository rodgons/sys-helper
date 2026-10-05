# CQRS
Aliases: command query responsibility segregation, separate read and write models
Gist: Writes and reads go through separate models, often separate stores.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs

## Beginner
CQRS means the part of a system that changes data is separate from the part that reads it. Think of a restaurant where the kitchen cooks the orders while a board at the front shows what is ready: each is built for its own job. Changes go through a model that checks the business rules, and reads come from a model shaped for quick display. The read side is often a separate copy of the data that is updated shortly after each change.

## Intermediate
**Commands**, such as placing an order, go to a write model that enforces business rules and saves changes. **Queries** go to read models shaped for each screen, which can be views in the same database or separate stores, such as a cache or a search index, updated from events or change data capture. Each side can then be scaled, tuned and secured on its own. The cost is more moving parts and, with separate stores, eventual consistency: a user may not see their own change right away. Pick it when reads and writes differ a lot in shape or load, or when the write side has complex domain rules. For simple CRUD, one model is easier and usually enough.

## Expert
Read-your-writes needs explicit handling, such as returning the new state from the command, waiting until the projection reaches the write's version, or briefly serving that user from the write side. Projections must be idempotent and rebuildable, and changing a read model's schema often means replaying history into a new projection and switching over. CQRS pairs naturally with event sourcing, but the two are independent, and applying it to a whole system instead of the few bounded contexts that need it is a common source of accidental complexity.
