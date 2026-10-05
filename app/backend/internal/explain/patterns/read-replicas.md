# Read Replicas
Aliases: read replica, replica reads, read scaling, read-only replicas, read/write splitting
Gist: Send reads to follower copies so the primary only handles writes.
Reference: https://aws.amazon.com/rds/features/read-replicas/

## Beginner
A read replica is an extra copy of a database that is kept up to date and only answers questions, never accepts changes. The app sends all changes to the main database, the primary, and sends most lookups to the replicas. This spreads the work, so the main database is not overloaded when many people are reading at once. It is like a library that keeps several copies of a popular book: only one is edited, but many people can read at the same time.

## Intermediate
Replicas are followers in leader-follower replication: the primary streams its changes to them, usually asynchronously. The app or a database proxy routes writes and reads that must be current to the primary, and other reads to the replicas, often through a load-balanced reader endpoint. Adding replicas scales read throughput almost linearly and can isolate heavy queries, such as reports, from the primary. The cost is replication lag: a replica may return data that is a few milliseconds to several seconds old, so a user may not see a change they just made. Pick it for read-heavy workloads that tolerate slightly stale reads; it does nothing for write load, which needs sharding instead.

## Expert
Lag is unbounded under load (long transactions, heavy writes, vacuum or DDL on the primary), so routing must handle read-your-writes, for example by reading from the primary for a short time after a user's write or by waiting until a replica reaches the write's log position. Long queries on a replica can conflict with changes being replayed, forcing a choice between cancelling queries and letting lag grow (for example `hot_standby_feedback` in PostgreSQL, which then bloats the primary). Losing a replica shifts its share of reads to the others or to the primary, so size for N-1, and treat a lagging replica as unhealthy rather than serving very stale data. Replicas only add capacity where reads dominate; caching the same hot reads is often cheaper than another replica.
