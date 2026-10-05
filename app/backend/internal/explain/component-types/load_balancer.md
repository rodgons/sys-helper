# Load Balancer
Gist: Spreads incoming requests across several instances of a service and stops sending to unhealthy ones.
Reference: https://github.com/donnemartin/system-design-primer#load-balancer

## Beginner
A load balancer stands in front of several copies of the same server and decides which copy handles each request. If one copy breaks, it stops sending work there, so users do not notice. It is like a host at a busy restaurant who seats each new group at a free table instead of crowding one waiter. The **algorithm** property is the rule it uses to choose, for example taking turns.

## Intermediate
A load balancer works at layer 4 (it routes TCP or UDP connections by address and port) or layer 7 (it reads HTTP and can route by path, host or header). It runs health checks and removes failing instances, and it usually terminates TLS so the services behind it do not have to. Common **algorithms** are round robin, least connections, and hashing on a key such as client IP when requests should stick to one instance. It lets you add instances to scale out and deploy without downtime, but only works cleanly if the services are stateless or share their state elsewhere. Managed cloud load balancers are themselves redundant; a self-hosted one needs a standby, or it becomes a single point of failure.

## Expert
Round robin assumes equal requests and equal instances, so with uneven request costs least-outstanding-requests or power-of-two-choices balances much better. Sticky sessions and consistent hashing help cache locality but leave hot spots and lose state when an instance leaves. Health checks that are too shallow route traffic to broken instances, while checks that touch shared dependencies can fail every instance at once; pair them with connection draining and slow start for new instances. Long-lived connections such as WebSockets and HTTP/2 or gRPC streams pin traffic, so rebalancing after a scale-out needs connection limits or client-side balancing.
