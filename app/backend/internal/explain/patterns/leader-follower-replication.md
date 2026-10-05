# Leader-Follower Replication
Aliases: replication, primary-replica, primary/secondary, master-slave, single-leader, leader-based replication, active/passive replication
Gist: One node takes writes and streams them to followers that hold copies.
Reference: https://github.com/donnemartin/system-design-primer#master-slave-replication

## Beginner
Leader-follower replication keeps several copies of the same database on different machines. One machine, the leader, is the only one allowed to accept changes. It sends every change to the other machines, the followers, so they keep an up-to-date copy. If the leader breaks, one of the followers can take over, so the data is not lost and the system keeps running. It is like a teacher writing on the main board while students copy it into their notebooks, and if the board is wiped, a notebook still has everything.

## Intermediate
All writes go to the leader, which records them in its log (such as the write-ahead log or binlog) and streams that log to followers, which apply the changes in the same order. Because only one node accepts writes, there are no write conflicts to resolve. With asynchronous replication the leader confirms writes without waiting for followers, which is fast but can lose the latest writes if the leader dies; synchronous replication waits for at least one follower, which is safer but slower and blocks if that follower is down. Followers give you failover and backups, and can also serve reads. Pick it as the default for a relational database that needs high availability; it does not scale writes, because the leader still takes all of them.

## Expert
Failover is the hard part: promoting an asynchronous follower drops the writes it had not received, and a wrongly detected leader failure can leave two nodes accepting writes (split brain) unless the old leader is fenced, for example with epoch numbers or STONITH. Reads from followers see replication lag, which breaks read-your-writes and monotonic reads unless reads are routed to the leader or pinned to a replica at a known log position. Semi-synchronous setups (one synchronous follower, the rest asynchronous) bound data loss on failover without blocking writes on every replica. Statement-based replication breaks on nondeterministic functions, so production systems use row-based or physical log shipping, which in turn ties followers to the leader's version during upgrades.
