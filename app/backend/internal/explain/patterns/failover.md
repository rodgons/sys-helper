# Failover
Aliases: fail-over, active-passive failover, hot standby, warm standby, active-active failover, automatic failover
Gist: When a node dies, a standby takes over its traffic or role.
Reference: https://github.com/donnemartin/system-design-primer#fail-over

## Beginner
Failover means keeping a spare ready to take over when the main machine stops working. Think of a backup goalkeeper on the bench: if the first goalkeeper gets hurt, the backup steps in and the game goes on. The system checks the main machine with regular "are you alive?" messages, called heartbeats. When the answers stop, it sends traffic to the spare instead.

## Intermediate
A monitor sends heartbeats to the active node and, when they stop, promotes a standby and moves traffic to it, usually by updating a DNS record, a virtual IP or the load balancer's target list. In **active-passive**, the standby waits idle: a hot standby is already running with current data, a warm one needs some startup or catch-up first. In **active-active**, every node serves traffic and the survivors absorb a failed node's share, so each one needs spare capacity. The cost is extra hardware that mostly waits, plus the chance of losing writes the standby had not yet received. Use it for any single point of failure whose downtime hurts, such as a primary database or a load balancer. Stateless services behind a load balancer rarely need it, because health checks already remove dead instances.

## Expert
Detection is the hard part: a short timeout fails over on a GC pause or network blip, and a partition can leave two nodes both acting as primary (split brain), so production setups use a quorum or consensus-based lease plus fencing tokens or STONITH to stop the old primary from writing. With asynchronous replication, promoting a lagging replica loses acknowledged writes, and when the old primary returns its divergent writes must be discarded or reconciled. DNS-based switching is bounded by TTLs and by clients that ignore them, while a floating IP or load balancer switch is faster but needs its own redundancy. Exercise failover regularly, because an untested standby often has stale config, cold caches or too little capacity for the full load.
