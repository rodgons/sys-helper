# Materialized View
Aliases: precomputed view, read model, projection, summary table
Gist: Precompute and store query results shaped for how they are read.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view

## Beginner
A materialized view is a saved answer to a question you ask often. Instead of adding up a long receipt every time someone asks for the total, you write the total at the bottom once and update it when an item changes. The database or a background job runs the expensive query ahead of time and stores the result as its own table. Reading it is then fast, though the stored answer can be a little out of date.

## Intermediate
The view holds data already joined, filtered or aggregated into the shape a screen or API needs, and it is refreshed from the source data. Refresh can be a full rebuild on a schedule, an incremental update where the database supports it, or an event-driven update in which each source change updates the view. Reads become simple and cheap, but the view takes extra storage and lags behind the source. Pick it when the same expensive query runs often and slightly stale results are fine, as with dashboards, feeds and reports. Skip it when the query is already cheap, when results must be exactly current, or when the source changes so often that refreshing costs more than it saves.

## Expert
Full refreshes slow down as data grows, and in PostgreSQL `REFRESH MATERIALIZED VIEW` blocks reads unless you add `CONCURRENTLY`, which needs a unique index and takes longer. Event-driven views need idempotent updates applied in order per key, or replays and out-of-order delivery corrupt the aggregates. Because the view is derived, it must be rebuildable from the source or an event log, and rebuilding a large one needs a plan, such as filling a new table and swapping it in. Measure the lag and show readers that the data may be stale.
