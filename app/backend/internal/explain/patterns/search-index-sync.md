# Search Index Sync
Aliases: dedicated search index, event-driven indexing, search indexing, full-text search index, index sync
Gist: Copy searchable data into a search engine, kept in sync from the database (often through CDC or a queue).
Reference: https://learn.microsoft.com/en-us/azure/architecture/data-guide/scenarios/search

## Beginner
Search index sync keeps a copy of your data in a search engine so users can search it quickly. Think of the index at the back of a book: it is a separate list built for finding things, and it has to be updated when the book changes. The main database stays the place where data is saved, and the search engine gets a copy shaped for searching by words and filters. When data changes in the database, the change is passed on to the search engine, usually within a few seconds.

## Intermediate
The database stays the source of truth, and a search engine such as Elasticsearch or OpenSearch holds documents built for full-text search, relevance ranking and filters. Changes reach the index through change data capture from the database log, events published to a queue, or periodic batch jobs. Writing to both the database and the index from the request handler is simpler but fragile, because one write can succeed while the other fails. The index is eventually consistent, so a user may not find a record they just saved. Pick it when users need text search, typo tolerance or rich filtering that database indexes handle poorly. For simple lookups or small datasets, the database's own full-text features are often enough.

## Expert
Dual writes from the app drift silently on partial failure, so prefer CDC or a transactional outbox, and apply updates idempotently and in order per document (for example, using the source row version as an external version) so retries and reordering cannot overwrite newer data with older. Deletes must travel as tombstones in the stream, or removed records linger in results. Mapping changes usually need a full reindex into a new index behind an alias, with live changes applied to both, then an atomic alias swap. Run periodic reconciliation against the database, because every pipeline eventually drops or misorders something.
