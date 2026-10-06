# Database
Gist: The system of record that stores your data durably and answers queries about it.
Reference: https://github.com/donnemartin/system-design-primer#database

## Beginner
A database is where the system keeps information that must not be lost, such as users, orders and messages. Services ask it to save new data and to find existing data. It is like a well-organised filing cabinet with an index, so you can quickly find any folder. The **engine** is which database product you use, **replicas** are extra copies, and **sharding** means splitting the data across several machines.

## Intermediate
The **engine** sets the data model: relational engines like PostgreSQL give tables, joins and transactions; document, key-value and wide-column stores give flexible schemas and easier horizontal scaling with fewer guarantees. **Replicas** copy the primary's data, giving failover and extra read capacity, but asynchronous replicas lag, so a read right after a write may not see it. **Sharding** splits data by a key, such as user ID, so each machine holds part of it; it scales writes and storage but makes cross-shard queries and transactions hard. Scale in order: indexes and query tuning, a bigger machine, read replicas and caching, and only then sharding. Pick the shard key from the main access pattern, because changing it later means moving all the data.

## Expert
Failover with asynchronous replication can lose recent commits and, without fencing, leave two primaries accepting writes; synchronous or quorum replication avoids that at the cost of write latency. A poor shard key creates hot shards (celebrity users, time-ordered keys), and resharding live data is one of the riskiest migrations a team runs. Connection limits, long transactions holding locks, and table bloat or compaction stalls cause more production incidents than raw capacity, and backups count only once you have tested a restore.
