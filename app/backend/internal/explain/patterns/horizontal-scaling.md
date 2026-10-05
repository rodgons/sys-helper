# Horizontal Scaling
Aliases: scale out, scaling out, stateless services, stateless app tier, add more instances
Gist: Run many interchangeable stateless instances behind a load balancer instead of a bigger machine.
Reference: https://github.com/donnemartin/system-design-primer#horizontal-scaling

## Beginner
When a server gets too busy, you can either buy a bigger server or add more servers of the same size. Horizontal scaling means adding more servers, each running the same program, with a load balancer sharing the requests between them. To make this work, no server keeps anything important only in its own memory, so any server can handle any request. It is like opening more checkout lanes at a supermarket instead of asking one cashier to work faster.

## Intermediate
Each instance is stateless: sessions, uploads and other state live in shared stores such as a database, a cache or object storage. A load balancer spreads requests across instances, and you add or remove instances as load changes, often automatically with autoscaling. This gives near-linear capacity growth and tolerance to the loss of any single instance, unlike vertical scaling (a bigger machine), which hits a hardware ceiling and stays a single point of failure. The cost is more moving parts, and the shared stores now take the combined load of every instance. Pick it for the application tier of almost any web service; for a database it is much harder and needs replication or sharding instead.

## Expert
Scaling out the stateless tier usually moves the bottleneck to shared dependencies: database connection counts grow with instance count and need pooling (for example a proxy such as PgBouncer), and caches and downstream services must absorb the extra fan-in. Autoscaling reacts with a lag of minutes, so it needs headroom, warm-up handling and scale-in with connection draining, and scaling on the wrong signal (CPU for an I/O-bound service) does not help. Hidden state such as in-process caches, local files, scheduled jobs that run on every instance or in-memory rate limits breaks correctness once there are many instances. Per-instance overhead and coordination costs mean that for small or bursty workloads a larger single instance can be simpler and cheaper.
