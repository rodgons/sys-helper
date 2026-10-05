# DNS
Gist: The Domain Name System, which turns a host name like api.example.com into the IP addresses clients connect to.
Reference: https://github.com/donnemartin/system-design-primer#domain-name-system

## Beginner
Computers find each other by numeric addresses, but people remember names like example.com. DNS is the internet's phone book: you look up a name and it gives back the number to call. A client asks DNS first, before it sends any real request to your system. Answers are remembered for a while, so the lookup is usually fast.

## Intermediate
A client asks a recursive resolver, which walks from the root servers to the authoritative name servers for your domain and caches the answer for its **TTL** (time to live). Records point a name at addresses (`A`, `AAAA`) or at another name (`CNAME`), usually a CDN or load balancer rather than a single server. Managed DNS can also steer traffic: weighted, latency-based or geographic routing, and health-checked failover between regions. The trade-off is the TTL: short TTLs let you move traffic quickly but cause more lookups, long TTLs are cheap and resilient but make changes slow to take effect. Draw DNS when the design depends on how traffic reaches the right region or entry point; it is implied otherwise.

## Expert
DNS failover is only as fast as the slowest cache, and some resolvers and clients ignore low TTLs or pin addresses, so it cannot replace a load balancer for quick failover inside a region. Your DNS provider is a single point of failure for every name it serves, which is why large sites run two providers or rely on heavily anycast networks. Geo routing goes by the resolver's location, not the user's, unless the resolver sends EDNS Client Subnet. Lock down the registrar and enable DNSSEC where you can, because hijacked records redirect all traffic.
