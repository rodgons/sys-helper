import type { Explanations } from '../lib/explanations';

/** A small catalog as `GET /api/explanations` serves it. */
export const EXPLANATIONS: Explanations = {
  patterns: [
    {
      id: 'cache-aside',
      name: 'Cache-Aside',
      aliases: ['lazy loading'],
      gist: 'The app reads the cache first.',
      reference: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
      explanations: {
        beginner: 'Like keeping **books** on your desk.',
        intermediate: 'On a miss the app loads and fills the cache.',
        expert: 'Hot keys stampede the database on expiry.',
      },
    },
    {
      id: 'sharding',
      name: 'Sharding',
      aliases: ['partitioning'],
      gist: 'Split one dataset across several databases.',
      reference: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding',
      explanations: { beginner: 'Shelves.', intermediate: 'Shard keys.', expert: 'Hot shards.' },
    },
  ],
  componentTypes: [
    {
      type: 'api_gateway',
      name: 'API Gateway',
      gist: 'The front door for client calls.',
      reference: 'https://example.test/api-gateway',
      explanations: {
        beginner: 'A receptionist.',
        intermediate: 'Routes calls.',
        expert: 'Fan-out.',
      },
    },
    {
      type: 'cache',
      name: 'Cache',
      gist: 'Fast memory in front of slower storage.',
      reference: 'https://example.test/cache',
      explanations: {
        beginner: 'A notepad.',
        intermediate: 'Key-value memory.',
        expert: 'Eviction.',
      },
    },
  ],
};
