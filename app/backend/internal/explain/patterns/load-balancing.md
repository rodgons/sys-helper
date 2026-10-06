# Load Balancing
Aliases: load balancer, round robin, least connections, L4/L7 load balancing, layer 7 routing
Gist: Spread requests across identical instances and route around unhealthy ones.
Reference: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview

## Beginner
A load balancer sits in front of several copies of the same server and hands each incoming request to one of them. This way no single server gets all the work, and the system can handle more users. If one server breaks, the load balancer stops sending it requests, so users don't notice. It is like a host at a busy restaurant seating guests across all the open tables and skipping the table that is being cleaned.

## Intermediate
Clients connect to one address, and the load balancer forwards each connection or request to a backend chosen by an algorithm such as round robin, least connections or a hash of the client. It runs health checks and removes failing backends from the pool until they recover. A layer 4 balancer forwards TCP or UDP connections without reading them, which is fast and protocol-agnostic. A layer 7 balancer understands HTTP, so it can route by path or host, terminate TLS and retry failed requests, at the cost of more processing. Use it whenever you run more than one instance of a service; it does not help if the bottleneck is a shared database behind the instances.

## Expert
Health checks that are too shallow keep routing to instances whose dependencies are broken, while deep checks that call the database can eject every instance at once during a dependency blip; many balancers fail open when all backends look unhealthy. Long-lived connections (HTTP/2, gRPC, WebSockets) defeat per-connection balancing and leave load uneven after scale-out, so balance per request at layer 7 or cap connection lifetime. Sticky sessions hide state in instances and unbalance load, and least-connections or round robin with uneven request costs benefit from slow start for new instances and connection draining on removal. The balancer itself must be redundant (managed service, anycast or DNS across a pair), or it becomes the single point of failure it was meant to remove.
