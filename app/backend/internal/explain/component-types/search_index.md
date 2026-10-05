# Search Index
Gist: A secondary store built for full-text search, relevance ranking and filtering, such as Elasticsearch.
Reference: https://www.elastic.co/docs/manage-data/data-store/index-basics

## Beginner
A search index helps users find things by typing words, like searching products or articles. It keeps a special list of which words appear in which items, so it can answer quickly and show the best matches first. It works like the index at the back of a book: you look up a word and get the pages where it appears. The **engine** is the software that runs the search.

## Intermediate
The index stores an **inverted index**: text is split into terms (tokenised, lowercased, stemmed), and each term points to the documents that contain it. That makes keyword search, typo tolerance, relevance ranking and faceted filters fast in ways a normal database index is not. It is usually not the system of record: services write to the database and copy changes to the index, often through a queue or change data capture. The trade-off is a second copy of the data that lags behind and can drift, plus another cluster to run. For small data sets or simple filters, the database's built-in full-text search is often enough.

## Expert
Because the index is derived data, you need a reliable sync path and a way to rebuild it from scratch, usually by reindexing into a new index and switching an alias. Mapping and analyser changes require a full reindex, and shard count is hard to change later, so over- or under-sharding shows up as either wasted overhead or oversized shards that recover slowly. Near-real-time refresh means newly written documents appear after a delay, and deep pagination and high-cardinality aggregations are common causes of memory pressure.
