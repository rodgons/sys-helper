# API Gateway
Gist: The single front door for client API calls, routing each request to the right backend service.
Reference: https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway

## Beginner
An API gateway is the one address that apps talk to, even when many separate services work behind it. It reads each request and passes it to the service that knows how to answer. It is like a hotel reception desk: guests ask at one place, and the desk sends the request to housekeeping, the kitchen or maintenance. It also checks who you are before letting the request through.

## Intermediate
The gateway sits between clients and the services, usually behind a load balancer or CDN. Besides routing by path or host, it handles cross-cutting work in one place: authentication, rate limiting, TLS, request logging, and sometimes combining several service calls into one response. This keeps clients simple and lets you split or move services without changing the public API. The cost is an extra network hop and a shared component that every request depends on, so it must scale and stay available. Skip it for a single service or monolith, where a load balancer or reverse proxy is enough.

## Expert
A gateway that grows business logic, request orchestration or per-team transformations becomes a coupled bottleneck that every team must change and deploy, so keep it thin or split it per client type. It is a blast-radius concentrator: a bad config push or slow plugin degrades every API at once, and its timeouts must be tuned against each downstream or one slow service exhausts its connection pool. Rate limits and authentication enforced only at the gateway leave services exposed to internal callers that bypass it.
