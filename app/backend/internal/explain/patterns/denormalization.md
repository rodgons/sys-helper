# Denormalization
Aliases: denormalized data, duplicating data, precomputed joins
Gist: Copy data into the rows that read it, trading write cost and duplication for faster reads.
Reference: https://github.com/donnemartin/system-design-primer#denormalization

## Beginner
Denormalization means storing the same piece of information in more than one place so it is quicker to read. Think of writing a friend's phone number on the fridge as well as in your address book: you find it faster, but if it changes you must update both. In a database, this could mean storing the author's name on each post instead of looking it up in a separate table every time. Reads get faster, but every change has more places to update.

## Intermediate
A normalized schema stores each fact once and joins tables at read time. Denormalizing copies columns into the rows that read them, such as an author name on each post, or stores precomputed values, such as a `comment_count` on the post, so a hot query becomes a read of one row or one table. The cost moves to writes: every update must change all copies, and a missed update leaves copies that disagree. Use it on read-heavy paths where joins are the bottleneck, and in stores without joins, such as many NoSQL and sharded databases, where it is often the only option. Avoid it when the copied data changes often or must always match exactly, and measure first, because an index or a cache may be enough.

## Expert
Keep copies in sync in the same transaction when they share a database, and through CDC or events when they do not, accepting a window in which readers see stale copies. Counters updated in place become row-lock hot spots under heavy writes, so shard the counter or aggregate it asynchronously. Changing a widely copied value, such as renaming a user with millions of posts, turns one write into a large fan-out job that needs batching and idempotent retries. Treat the normalized source as the truth and make every copy rebuildable from it, so drift can be detected and repaired.
