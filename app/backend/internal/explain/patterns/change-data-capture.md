# Change Data Capture
Aliases: CDC, transaction log tailing, binlog streaming, WAL streaming
Gist: Read the database's own change log and publish each change as an event.
Reference: https://microservices.io/patterns/data/transaction-log-tailing.html

## Beginner
Change data capture watches a database's own change history and announces every change to other systems. Every database keeps a diary of each insert, update and delete, so it can recover after a crash. CDC reads that diary and sends each entry out as a message, much like a camera on a shop door records who comes in without anyone having to report it. Other parts of the system, like a cache or a search engine, use those messages to stay up to date.

## Intermediate
A connector reads the database's replication log (the MySQL binlog, the PostgreSQL WAL through logical decoding, or similar) and publishes each committed change as an event, often to a log such as Kafka. The app writes only to the database and still gets reliable, ordered events, which avoids the dual-write problem of saving to the database and sending a message separately. Consumers use the events to update caches, search indexes, read models or a data warehouse. The trade-off is operational: you run and monitor the connector, and the events describe table rows, not business events. Pick it to keep derived stores in sync with a database, or to stream data out of a legacy system you cannot change. If consumers need meaningful domain events, a transactional outbox gives you control over the event shape.

## Expert
Events mirror the physical schema, so renaming a column breaks every consumer unless you add a translation layer or capture from an outbox table instead. The connector needs an initial snapshot coordinated with a log position, and if it falls behind, the source may discard log segments it still needs, or, with a PostgreSQL replication slot, keep WAL until the disk fills. Ordering holds per key or partition, not globally, and delivery is usually at-least-once, so consumers must be idempotent. Large transactions, `TRUNCATE` and schema changes are the usual edge cases that connectors handle inconsistently.
