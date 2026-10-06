# API Gateway
Aliases: gateway, single entry point, edge service, API front door
Gist: One entry point routes client calls to services and handles cross-cutting concerns.
Reference: https://microservices.io/patterns/apigateway.html

## Beginner
When a system is split into many small services, clients would otherwise need to know the address of each one. With an API gateway, clients send every request to one place, and the gateway passes it to the right service. The gateway can also do shared jobs once for everyone, such as checking who the user is. It is like the reception desk of a large office: visitors go to one desk, show their badge, and get sent to the right room.

## Intermediate
The gateway maps public routes to internal services and applies cross-cutting concerns in one place: authentication, TLS termination, rate limiting, request logging and sometimes response caching. It can also aggregate several service calls into one response, or expose a different API per client type (backends for frontends), which saves round trips for mobile clients. This lets you change the internal service layout without changing clients. The trade-offs are an extra network hop, a component that every request depends on, and a risk that business logic creeps into it. Choose it when several services are exposed to outside clients; with a single backend service, a load balancer or reverse proxy is usually enough.

## Expert
The gateway is a shared bottleneck in both runtime and organisation: it must be scaled and deployed redundantly, and if one team owns all its routes, every service change queues behind that team, which is why per-client gateways (backends for frontends) or self-service route config are common. Aggregation turns it into an orchestrator, so one slow backend can hold threads and requests open for all routes unless each call has timeouts, bulkheads and partial-response handling. Checking authentication at the gateway does not remove the need for services to authorise requests, because internal traffic that bypasses the gateway would otherwise be trusted. Retries at the gateway on top of client and service retries multiply load during an incident, so retry only idempotent calls and with a budget.
