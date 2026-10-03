import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import postgres from 'postgres';
import { expect, test } from '../e2e/fixtures';
import { apiUrl } from '../e2e/servers';
import { dagreLayout } from '../src/architecture/layout';
import type { ComponentNode, ConnectionEdge } from '../src/architecture/model';

// Captures the signed-in workspace for the home page (`src/assets/workspace-*.webp`), in both color
// schemes. A demo Project is seeded through the API (Project, Architecture) and the database
// (Conversation, Proposal, Requirements, Decisions), because the fake model only echoes.
// Run it with `make demo-screenshots`.

const sql = postgres(process.env.DATABASE_URL ?? '', { max: 1, onnotice: () => {} });
const outDir = 'src/assets';

const architecture = {
  components: [
    { id: 'app', type: 'client', name: 'Mobile app', properties: { platform: 'iOS, Android' } },
    { id: 'cdn', type: 'cdn', name: 'CDN' },
    { id: 'gateway', type: 'api_gateway', name: 'API gateway' },
    {
      id: 'feed',
      type: 'service',
      name: 'Feed service',
      properties: { runtime: 'Go', instances: '3' },
    },
    { id: 'upload', type: 'service', name: 'Upload service', properties: { runtime: 'Go' } },
    {
      id: 'db',
      type: 'database',
      name: 'Posts DB',
      properties: { engine: 'PostgreSQL', replicas: '1' },
    },
    { id: 'cache', type: 'cache', name: 'Feed cache', properties: { engine: 'Redis' } },
    { id: 'photos', type: 'object_store', name: 'Photo storage' },
  ],
  connections: [
    { id: 'app-cdn', source: 'app', target: 'cdn', kind: 'sync', label: 'images' },
    { id: 'app-gateway', source: 'app', target: 'gateway', kind: 'sync', label: 'HTTPS' },
    { id: 'gateway-feed', source: 'gateway', target: 'feed', kind: 'sync' },
    { id: 'gateway-upload', source: 'gateway', target: 'upload', kind: 'sync' },
    { id: 'feed-db', source: 'feed', target: 'db', kind: 'sync', label: 'writes' },
    { id: 'feed-cache', source: 'feed', target: 'cache', kind: 'sync', label: 'reads' },
    { id: 'upload-photos', source: 'upload', target: 'photos', kind: 'sync', label: 'originals' },
    { id: 'cdn-photos', source: 'cdn', target: 'photos', kind: 'sync', label: 'origin' },
  ],
};

const requirements = [
  ['scale', '50k daily users, growing to 500k within a year'],
  ['performance', 'The feed loads in under 300 ms at p95'],
  ['availability', 'Uploads keep working when the feed is degraded'],
  ['cost', 'Hosting stays under $500 a month at launch'],
] as const;

const decisions = [
  {
    title: 'Serve feeds from a Redis cache',
    rationale:
      'Users browse far more than they post, so precomputed feeds in memory keep the p95 low and the database mostly idle.',
    pattern: 'Cache-aside',
    alternative: 'Read replicas: more to operate, and still slower than memory.',
    requirements: [1, 2],
    targets: ['cache', 'feed-cache'],
  },
  {
    title: 'Deliver photos through a CDN',
    rationale:
      'Images are most of the bytes. Serving them from the edge is faster and cheaper than from the API.',
    pattern: 'CDN offload',
    alternative: 'Serving images from the Upload service.',
    requirements: [2, 4],
    targets: ['cdn', 'cdn-photos'],
  },
];

const conversation: { role: 'user' | 'assistant'; body: string }[] = [
  {
    role: 'user',
    body: "I'm building a photo sharing app, like a small Instagram. About 50k daily users at launch, and people mostly scroll their feed.",
  },
  {
    role: 'assistant',
    body: 'A read-heavy app, then. Two things shape the design most:\n\n1. **How fast must the feed feel?** I have assumed under 300 ms at p95.\n2. **What is the budget?** That decides how much we run ourselves.\n\nI have added both as requirements, along with the growth target.',
  },
  {
    role: 'user',
    body: 'Sounds right. Keep it under $500 a month. Next I want people to find photos by hashtag.',
  },
];

const proposalMessage =
  'Hashtag search needs an index the feed database is bad at. I propose a small **Search service** over an **OpenSearch** index, filled asynchronously from uploads through a queue, so a slow index never blocks posting.';

const proposal = {
  summary: 'Add hashtag search fed by an upload queue',
  changes: [
    {
      op: 'add_requirement',
      ref: 'search',
      category: 'functional',
      statement: 'Users find photos by hashtag',
    },
    {
      op: 'add_component',
      ref: 'queue',
      type: 'queue',
      name: 'Upload events',
      properties: { engine: 'SQS', delivery: 'at-least-once' },
    },
    {
      op: 'add_component',
      ref: 'search-api',
      type: 'service',
      name: 'Search service',
      properties: { runtime: 'Go' },
    },
    {
      op: 'add_component',
      ref: 'index',
      type: 'search_index',
      name: 'Hashtag index',
      properties: { engine: 'OpenSearch' },
    },
    {
      op: 'add_connection',
      source: 'upload',
      target: 'queue',
      kind: 'async',
      label: 'photo posted',
    },
    {
      op: 'add_connection',
      source: 'queue',
      target: 'search-api',
      kind: 'async',
      label: 'index tags',
    },
    {
      op: 'add_connection',
      ref: 'search-index',
      source: 'search-api',
      target: 'index',
      kind: 'sync',
      label: 'queries',
    },
    { op: 'add_connection', source: 'gateway', target: 'search-api', kind: 'sync' },
    {
      op: 'add_decision',
      title: 'Index hashtags asynchronously',
      rationale: 'Posting must not wait for the index, and a queue absorbs bursts of uploads.',
      pattern: 'Event-driven indexing',
      alternative: 'LIKE queries on Postgres: fine at first, slow once tags grow.',
      requirements: ['R3', 'search'],
      targets: ['queue', 'search-index'],
    },
  ],
};

test.afterAll(() => sql.end());

function only<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined)
    throw new Error(`expected one row, got ${rows.length}`);
  return row;
}

/** Re-encodes a PNG screenshot as WebP with the browser's own encoder: a fifth of the size. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.9);
  }, png.toString('base64'));
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/**
 * Places the components where dagre puts them in the graph *after* the Proposal. The preview
 * offsets new components by how far the existing ones sit from that same layout, so they land in
 * their own spots instead of off to the side.
 */
function withLayout(doc: typeof architecture, changes: typeof proposal.changes) {
  const ids = [
    ...doc.components.map((c) => c.id),
    ...changes.flatMap((c) => (c.op === 'add_component' && c.ref ? [c.ref] : [])),
  ];
  const links = [
    ...doc.connections,
    ...changes.flatMap((c) =>
      c.op === 'add_connection' ? [{ source: c.source, target: c.target }] : [],
    ),
  ];
  const corners = dagreLayout(
    ids.map((id) => ({ id }) as ComponentNode),
    links.map((l) => ({ source: l.source, target: l.target }) as ConnectionEdge),
  );
  return {
    ...doc,
    components: doc.components.map((c) => ({
      ...c,
      position: corners.get(c.id) ?? { x: 0, y: 0 },
    })),
  };
}

// Messages are listed by id, so ids must sort in insert order: UUIDv7 with a timestamp that
// advances by a millisecond per call.
let clock = 0;
function uuidv7(): string {
  const time = (clock++).toString(16).padStart(12, '0');
  const rand = crypto.randomUUID().replaceAll('-', '');
  const variant = '89ab'.charAt(Number.parseInt(rand.charAt(3), 16) & 0x3);
  const h = `${time}7${rand.slice(0, 3)}${variant}${rand.slice(4, 19)}`;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

test('capture the workspace', async ({ page, signIn }) => {
  test.setTimeout(60_000);
  await signIn();
  await page.goto('/');
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token')) ?? '';
    return JSON.parse(localStorage.getItem(key) ?? '{}').access_token as string;
  });
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };

  // Other Projects fill the sidebar; the last one created is the demo.
  for (const name of ['Chat service', 'URL shortener'])
    await api('POST', '/api/projects', { name });
  const { slug } = await api('POST', '/api/projects', { name: 'Photo sharing app' });
  const { version } = await api('PUT', `/api/projects/${slug}/architecture`, {
    version: 0,
    document: withLayout(architecture, proposal.changes),
  });

  // After the welcome Message the new Project already has.
  clock = Date.now() + 1000;
  const project = only(
    await sql`SELECT id FROM projects WHERE slug_suffix = ${slug.split('-').at(-1)}`,
  );
  await sql.begin(async (tx) => {
    await tx`UPDATE projects SET experience_level = 'intermediate',
               next_requirement_num = ${requirements.length + 1}, next_decision_num = ${decisions.length + 1},
               next_proposal_seq = 2
             WHERE id = ${project.id}`;
    for (const [i, [category, statement]] of requirements.entries()) {
      await tx`INSERT INTO requirements (id, project_id, num, category, statement)
               VALUES (${uuidv7()}, ${project.id}, ${i + 1}, ${category}, ${statement})`;
    }
    for (const [i, d] of decisions.entries()) {
      await tx`INSERT INTO decisions (id, project_id, num, title, rationale, pattern, alternative, requirement_nums, targets, author)
               VALUES (${uuidv7()}, ${project.id}, ${i + 1}, ${d.title}, ${d.rationale}, ${d.pattern}, ${d.alternative},
                       ${d.requirements}, ${d.targets}, 'ai')`;
    }
    for (const m of conversation) {
      await tx`INSERT INTO messages (id, project_id, role, body) VALUES (${uuidv7()}, ${project.id}, ${m.role}, ${m.body})`;
    }
    const message = only(
      await tx`INSERT INTO messages (id, project_id, role, body)
                               VALUES (${uuidv7()}, ${project.id}, 'assistant', ${proposalMessage}) RETURNING id`,
    );
    await tx`INSERT INTO proposals (id, project_id, message_id, seq, base_version, summary, changes)
             VALUES (${uuidv7()}, ${project.id}, ${message.id}, 1, ${version}, ${proposal.summary}, ${tx.json(proposal.changes)})`;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/p/${slug}`);
    await expect(
      page.locator('.react-flow__node').filter({ hasText: 'Hashtag index' }),
    ).toBeVisible();
    await expect(page.getByText('Proposal #1', { exact: true })).toBeVisible();
    // More room for the canvas: hide the projects, then fit the drawing to the wider pane.
    await page.getByRole('button', { name: 'Hide projects' }).click();
    await page.getByRole('button', { name: 'Fit view' }).click();
    await page.waitForTimeout(800); // the fit animation and edge routing settle
    const png = await page.screenshot();
    writeFileSync(`${outDir}/workspace-${scheme}.webp`, await toWebp(page, png));
  }
});
