# Circuit Breaker
Aliases: breaker, fail fast
Gist: Stop calling a failing dependency for a while, then probe before resuming.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker

## Beginner
When a service the system depends on keeps failing, a circuit breaker stops sending it requests for a while. Requests fail immediately instead of waiting on something that is down, which keeps the rest of the system responsive. After a pause, it lets one test request through to see if the service has recovered. It works like the fuse box in a house, which cuts power when something goes wrong so the damage does not spread.

## Intermediate
The breaker wraps calls to a dependency and has three states. **Closed** passes calls through and counts failures; when the failure rate crosses a threshold it moves to **Open**, where calls fail at once without reaching the dependency. After a timeout it moves to **Half-open** and lets a few trial calls through: success closes it, failure opens it again. This stops threads and connections piling up on a dead dependency and gives it room to recover. The cost is tuning thresholds and deciding what to return while open, such as a cached value, a default or an error. Use it for remote dependencies that can fail or slow down; it adds little for in-process calls or for a dependency the request cannot do without and has no fallback for anyway.

## Expert
Trip on failure rate over a sliding window with a minimum request count, and count slow calls as failures, otherwise a dependency that hangs never trips the breaker. Breaker state is usually per instance, so a large fleet trips unevenly; scope breakers per dependency and ideally per endpoint or host, so one bad shard does not cut off healthy ones. Combine with timeouts and bulkheads, and put retries inside the breaker so retries count toward tripping it rather than bypassing it. Too aggressive a setting turns brief blips into outages, so emit state changes as metrics and alert on them.
