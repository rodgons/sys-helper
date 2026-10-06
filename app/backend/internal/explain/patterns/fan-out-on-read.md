# Fan-out on Read
Aliases: pull model, read fan-out, merge on read, query-time feed assembly
Gist: Build a feed when it is read by merging recent posts from everyone the user follows.
Reference: https://www.infoq.com/presentations/Twitter-Timeline-Scalability/

## Beginner
A post is saved once, in the author's own list. When someone opens their feed, the system gathers the latest posts from everyone they follow and sorts them by time. It is like visiting each friend's noticeboard to see what is new, instead of having copies posted to you. Posting is cheap, but opening the feed takes more work.

## Intermediate
On read, the service fetches the follow list, queries recent posts for each followed account, and merges them into one time-ordered page. Writes are a single insert, so posting is fast and there are no extra copies to store or clean up when a post is edited or deleted. The cost moves to reads: latency grows with the number of accounts followed, and each feed load touches many partitions. Caching recent posts per author and caching the assembled page reduces the load. Pick it when writes are frequent, follower counts are very large or skewed, or feeds are rarely read. Avoid it as the only approach when users follow thousands of accounts and expect instant feeds.

## Expert
The read is a scatter-gather k-way merge, so tail latency is set by the slowest partition, and you need per-source limits and timeouts with partial results. Pagination needs a stable cursor such as a timestamp plus id across all sources, not an offset. It is the usual companion to fan-out on write: high-follower accounts are pulled at read time and merged into the precomputed feed, which bounds both write amplification and read cost. Ranked feeds make this harder, because candidate generation and scoring then run on every read.
