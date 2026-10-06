# Fan-out on Write
Aliases: push model, write fan-out, precomputed timelines, timeline cache, inbox per user
Gist: On each post, write it into every follower's feed so reads are a single lookup.
Reference: https://www.infoq.com/presentations/Twitter-Timeline-Scalability/

## Beginner
When someone posts, the system immediately copies the post into the feed of every person who follows them. Later, when a follower opens their feed, it is already built and loads fast. It is like a newspaper delivered to each subscriber's door, rather than everyone going to the printer to pick one up. The work happens when posting, not when reading.

## Intermediate
A post write enqueues a job that looks up the author's followers and appends the post id to each follower's feed list, often in an in-memory store such as Redis. Reading a feed is then one lookup of a short, precomputed list, followed by hydrating the post ids. This suits read-heavy systems where feeds are read far more often than posts are written. The cost is write amplification: one post becomes as many writes as the author has followers, and a celebrity post can mean millions of writes and noticeable delivery lag. It also stores many copies and wastes work on inactive followers. Avoid it alone when follower counts are highly skewed, and avoid it entirely when writes outnumber reads.

## Expert
Production feeds are usually hybrid: fan out on write for normal accounts and merge high-follower accounts at read time, which caps the worst-case write amplification. Keep feed lists bounded (a few hundred ids), store ids rather than full posts so edits and deletes stay cheap, and skip or lazily rebuild feeds for inactive users to save memory. Deletes, unfollows and privacy changes need a reverse fan-out or a read-time filter, and the asynchronous fan-out queue must be monitored for lag, since a backlog shows up as missing posts rather than errors.
