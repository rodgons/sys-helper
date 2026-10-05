/**
 * PROTOTYPE — throwaway, lives only on the `prototype/pattern-explanations` branch.
 *
 * Question (map #81, ticket #86): what do the Pattern link and its explanation look like?
 * Three variants on the real workspace route (`/p/:slug`), switchable via `?variant=A|B|C` and the
 * floating bar at the bottom-left (dev builds only; Alt+←/→ also cycles):
 *
 *   A  Popover  — the pattern text is a link; its explanation opens in a popover anchored to it.
 *   B  Drawer   — the explanation opens in a drawer over the right edge (a bottom sheet on phones).
 *   C  Inline   — a "What is …?" disclosure expands the explanation inside the Decision card.
 *
 * Each shows the Project's Experience Level first, with the other two a click away. Matching is
 * faked on the client against a stub catalog of five Patterns (the real one is computed by the
 * server as `patternId`). Try a Decision whose pattern is "Cache-aside", "read replicas",
 * "Sharding", "throttling" or "Primary-Replica relational database" (stays plain).
 */
import * as stylex from '@stylexjs/stylex';
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Markdown } from '../conversation/markdown';
import { color, font, media, radius, space, text } from '../design/tokens.stylex';
import { LEVELS, useKnowledge } from '../lib/knowledge';

type Level = 'beginner' | 'intermediate' | 'expert';
type Pattern = {
  id: string;
  name: string;
  aliases: string[];
  gist: string;
  reference: string;
  explanations: Record<Level, string>;
};

export const PATTERNS: Pattern[] = [
  {
    id: 'cache-aside',
    name: 'Cache-Aside',
    aliases: ['cache aside', 'lazy loading', 'look-aside cache'],
    gist: 'The app reads the cache first. On a miss it loads from the database and fills the cache.',
    reference: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
    explanations: {
      beginner:
        "Think of a sticky note on your desk with a phone number you dial a lot. Before looking it up in the big directory, you check the note. **The cache is the sticky note** and the database is the directory. When the note doesn't have it, you look it up once and write it down, so next time is instant. It makes repeated reads fast and takes load off the database.",
      intermediate:
        'The service checks the cache by key. On a **hit** it returns the value; on a **miss** it reads the database, writes the result into the cache with a TTL, and returns it. Writes go to the database and **invalidate** (delete) the cached key. The trade-off is staleness: between a write and the invalidation, or if invalidation fails, readers can see old data until the TTL expires. Pick it when reads far outnumber writes and slightly stale reads are acceptable.',
      expert:
        'Failure modes: a hot key expiring causes a **stampede** (use request coalescing or probabilistic early refresh), and a write racing a miss can re-cache a stale value (delete-after-write plus short TTLs, or versioned keys). Cold starts hit the database at full load. Prefer write-through when readers must see their own writes.',
    },
  },
  {
    id: 'read-replicas',
    name: 'Read Replicas',
    aliases: ['read replica', 'read scaling', 'read/write splitting'],
    gist: 'Send reads to follower copies so the primary only handles writes.',
    reference: 'https://aws.amazon.com/rds/features/read-replicas/',
    explanations: {
      beginner:
        'Imagine one librarian who updates the catalogue and several assistants who each hold a copy of it and answer questions. Visitors asking questions go to the assistants, so the librarian is free to make changes. **Read replicas are those copies of the database.** They let many more people read at once.',
      intermediate:
        "The primary takes every write and streams its changes to one or more replicas; the service routes read-only queries to the replicas. Reads scale out by adding replicas. The catch is **replication lag**: a user may not see their own write if the next read hits a replica that hasn't caught up. Use it for read-heavy workloads that tolerate a little lag, and route read-your-writes paths to the primary.",
      expert:
        'Async replication means replicas can serve arbitrarily stale data under load; monitor lag and shed replicas past a bound. Read-your-writes needs session stickiness or LSN-aware routing. Replicas add no write capacity, and failover promotes a replica that may lack the last commits.',
    },
  },
  {
    id: 'leader-follower-replication',
    name: 'Leader-Follower Replication',
    aliases: ['primary-replica', 'master-slave', 'single-leader', 'replication'],
    gist: 'One node takes writes and streams them to followers that hold copies.',
    reference: 'https://github.com/donnemartin/system-design-primer#master-slave-replication',
    explanations: {
      beginner:
        'One database is the boss: every change goes through it. It then tells the other databases (followers) what changed so they keep identical copies. If the boss breaks, a follower can take over.',
      intermediate:
        'The leader orders all writes and ships its log to followers, synchronously or asynchronously. It gives a single source of truth with simple conflict handling, plus copies for reads and failover. Synchronous replication is safer but slower; asynchronous is faster but can lose recent writes on failover.',
      expert:
        'Watch for split brain on failover (fencing, consensus-based election), lost acknowledged writes with async followers, and the leader as a write bottleneck. Semi-sync (one sync follower) is the usual compromise.',
    },
  },
  {
    id: 'sharding',
    name: 'Sharding',
    aliases: ['horizontal partitioning', 'partitioning', 'hash partitioning'],
    gist: 'Split one dataset across several databases by a shard key.',
    reference: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding',
    explanations: {
      beginner:
        'When one filing cabinet is full, you buy more and decide a rule: names A–M go in the first, N–Z in the second. **Each cabinet is a shard.** Now no single cabinet holds everything, and several people can file at once.',
      intermediate:
        'Each row is placed on a shard by a **shard key** (hash or range). Both reads and writes scale with the number of shards. The cost: queries across shards are slow or impossible, transactions across shards need extra machinery, and a bad key creates hot shards. Choose a key that spreads load evenly and that most queries include.',
      expert:
        'Resharding is the hard part: plan for it with many logical shards per node or consistent hashing. Hot keys defeat any scheme (split or cache them). Cross-shard joins and uniqueness constraints move into the application.',
    },
  },
  {
    id: 'rate-limiting',
    name: 'Rate Limiting',
    aliases: ['throttling', 'rate limiter', 'token bucket'],
    gist: 'Cap how many requests a caller may make in a time window and reject the rest (429).',
    reference: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling',
    explanations: {
      beginner:
        'Like a ticket counter that serves each person at most five times a minute: anyone over the limit is asked to wait. It stops one greedy or broken client from overwhelming the system for everyone else.',
      intermediate:
        'The gateway or service counts requests per caller (user, API key, IP) in a window, usually with a **token bucket** in a shared store such as Redis, and answers `429 Too Many Requests` past the limit. It protects capacity and keeps usage fair. The trade-off is choosing limits that stop abuse without blocking legitimate bursts.',
      expert:
        "Distributed counters race: use atomic scripts or accept approximate limits per node. Sliding-window logs are accurate but memory-heavy; fixed windows burst at edges. Return `Retry-After`, and limit before expensive work (auth, DB) so the limiter itself isn't the bottleneck.",
    },
  },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[-–—_/\s]+/g, ' ')
    .trim()
    .replace(/ pattern$/, '');

/** Stub of the server's `patternId`: exact match after normalizing. */
export function matchPattern(text: string): Pattern | undefined {
  const t = norm(text);
  return PATTERNS.find((p) => [p.name, ...p.aliases].some((n) => norm(n) === t));
}

// ─── Variant plumbing ───────────────────────────────────────────────────────────────────────

const VARIANTS = [
  { key: 'A', name: 'Popover' },
  { key: 'B', name: 'Drawer' },
  { key: 'C', name: 'Inline' },
] as const;

function useVariant(): string {
  const [params] = useSearchParams();
  const v = params.get('variant');
  return VARIANTS.some((x) => x.key === v) ? (v as string) : 'A';
}

function useProjectLevel(): Level {
  const { slug = '' } = useParams();
  const k = useKnowledge(slug);
  const l = k.data?.experienceLevel;
  return l === 'beginner' || l === 'expert' ? l : 'intermediate';
}

// Variant B's drawer is one per page: a tiny module store says which Pattern is open.
let drawerOpen: Pattern | null = null;
const listeners = new Set<() => void>();
const setDrawer = (p: Pattern | null) => {
  drawerOpen = p;
  for (const l of listeners) l();
};
const useDrawer = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => drawerOpen,
  );

// ─── The explanation body, shared by all variants ───────────────────────────────────────────

function Explanation({ pattern, dense = false }: { pattern: Pattern; dense?: boolean }) {
  const projectLevel = useProjectLevel();
  const [level, setLevel] = useState<Level>(projectLevel);
  const tabsId = useId();
  return (
    <div {...stylex.props(styles.body, dense && styles.bodyDense)}>
      <p {...stylex.props(styles.gist)}>{pattern.gist}</p>
      <div role="tablist" aria-label="Explain for" {...stylex.props(styles.levels)}>
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="tab"
            id={`${tabsId}-${l.value}`}
            aria-selected={level === l.value}
            onClick={() => setLevel(l.value)}
            {...stylex.props(styles.level, level === l.value && styles.levelOn)}
          >
            {l.label}
            {l.value === projectLevel && <span {...stylex.props(styles.yours)}> · yours</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`${tabsId}-${level}`} {...stylex.props(styles.text)}>
        <Markdown>{pattern.explanations[level]}</Markdown>
      </div>
      <a
        href={pattern.reference}
        target="_blank"
        rel="noreferrer noopener"
        {...stylex.props(styles.ref)}
      >
        Read more <ExternalLink size={12} />
      </a>
    </div>
  );
}

// ─── The link, per variant ──────────────────────────────────────────────────────────────────

/** A Decision's pattern: plain text when it matches no Pattern, otherwise the variant's link. */
export function PatternText({ text: value }: { text: string }) {
  const variant = useVariant();
  const pattern = matchPattern(value);
  if (!pattern) return <>{value}</>;
  if (variant === 'B') return <DrawerLink text={value} pattern={pattern} />;
  if (variant === 'C') return <InlineDisclosure text={value} pattern={pattern} />;
  return <PopoverLink text={value} pattern={pattern} />;
}

function PopoverLink({ text: value, pattern }: { text: string; pattern: Pattern }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={ref} {...stylex.props(styles.anchor)}>
      <button
        type="button"
        aria-expanded={open}
        title={`What is ${pattern.name}?`}
        onClick={() => setOpen(!open)}
        {...stylex.props(styles.link)}
      >
        {value}
        <BookOpen size={12} />
      </button>
      {open && (
        <span role="dialog" aria-label={pattern.name} {...stylex.props(styles.popover)}>
          <span {...stylex.props(styles.popHead)}>
            <span {...stylex.props(styles.name)}>{pattern.name}</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              {...stylex.props(styles.close)}
            >
              <X size={14} />
            </button>
          </span>
          <Explanation pattern={pattern} dense />
        </span>
      )}
    </span>
  );
}

function DrawerLink({ text: value, pattern }: { text: string; pattern: Pattern }) {
  return (
    <button
      type="button"
      title={`What is ${pattern.name}?`}
      onClick={() => setDrawer(pattern)}
      {...stylex.props(styles.link)}
    >
      {value}
      <BookOpen size={12} />
    </button>
  );
}

/** Variant B's drawer; mounted once by the switcher. */
function PatternDrawer() {
  const pattern = useDrawer();
  useEffect(() => {
    if (!pattern) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pattern]);
  if (!pattern) return null;
  return (
    <aside aria-label={pattern.name} {...stylex.props(styles.drawer)}>
      <div {...stylex.props(styles.drawerHead)}>
        <span {...stylex.props(styles.kicker)}>Pattern</span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setDrawer(null)}
          {...stylex.props(styles.close)}
        >
          <X size={16} />
        </button>
      </div>
      <h2 {...stylex.props(styles.drawerName)}>{pattern.name}</h2>
      {/* key: reset the level tab when another Pattern opens */}
      <Explanation key={pattern.id} pattern={pattern} />
    </aside>
  );
}

function InlineDisclosure({ text: value, pattern }: { text: string; pattern: Pattern }) {
  return (
    <span {...stylex.props(styles.inline)}>
      <span>{value}</span>
      <details {...stylex.props(styles.details)}>
        <summary {...stylex.props(styles.summary)}>What is {pattern.name}?</summary>
        <Explanation pattern={pattern} dense />
      </details>
    </span>
  );
}

/** A `<datalist>` of Pattern names for the Decision form's pattern field (all variants). */
export function PatternSuggestions({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {PATTERNS.map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );
}

// ─── The variant switcher (dev builds only) ─────────────────────────────────────────────────

export function PrototypeSwitcher() {
  const [params, setParams] = useSearchParams();
  const current = useVariant();
  const i = VARIANTS.findIndex((v) => v.key === current);
  const go = (d: number) => {
    const next = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length];
    const p = new URLSearchParams(params);
    p.set('variant', next?.key ?? 'A');
    setParams(p, { replace: true });
    setDrawer(null);
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' && e.altKey) goRef.current(-1);
      if (e.key === 'ArrowRight' && e.altKey) goRef.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!import.meta.env.DEV) return null;
  return (
    <>
      {current === 'B' && <PatternDrawer />}
      <div {...stylex.props(styles.switcher)}>
        <button type="button" onClick={() => go(-1)} {...stylex.props(styles.switcherButton)}>
          <ChevronLeft size={16} />
        </button>
        <span>
          {current} ({VARIANTS[i]?.name})
        </span>
        <button type="button" onClick={() => go(1)} {...stylex.props(styles.switcherButton)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}

const styles = stylex.create({
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space['--space-1'],
    padding: 0,
    border: 'none',
    background: 'none',
    font: 'inherit',
    color: color['--color-accent-strong'],
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: 3,
    cursor: 'pointer',
  },
  anchor: { position: 'relative', display: 'inline-block' },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 50,
    display: 'block',
    width: 'min(22rem, calc(100vw - 2rem))',
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-lg'],
    backgroundColor: color['--color-raised'],
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.14)',
  },
  popHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: text['--text-sm'], fontWeight: 600, color: color['--color-fg'] },
  close: {
    display: 'inline-flex',
    padding: 4,
    border: 'none',
    borderRadius: radius['--radius-sm'],
    background: 'none',
    color: color['--color-fg-muted'],
    cursor: 'pointer',
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    fontSize: text['--text-sm'],
    color: color['--color-fg'],
  },
  bodyDense: {
    gap: space['--space-2'],
    fontSize: text['--text-xs'],
    marginTop: space['--space-2'],
  },
  gist: { margin: 0, fontWeight: 500 },
  levels: {
    display: 'flex',
    gap: 2,
    padding: 2,
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-subtle'],
  },
  level: {
    flexGrow: 1,
    paddingBlock: 4,
    paddingInline: space['--space-2'],
    border: 'none',
    borderRadius: radius['--radius-sm'],
    background: 'none',
    fontFamily: font['--font-mono'],
    fontSize: text['--text-2xs'],
    color: color['--color-fg-muted'],
    cursor: 'pointer',
  },
  levelOn: {
    backgroundColor: color['--color-surface'],
    color: color['--color-fg'],
    fontWeight: 600,
  },
  yours: { color: color['--color-accent-strong'] },
  text: { lineHeight: 1.55 },
  ref: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space['--space-1'],
    fontSize: text['--text-xs'],
    color: color['--color-accent-strong'],
  },
  drawer: {
    position: 'fixed',
    zIndex: 60,
    top: { default: 'auto', [media.md]: 0 },
    bottom: 0,
    left: { default: 0, [media.md]: 'auto' },
    right: 0,
    width: { default: 'auto', [media.md]: '26rem' },
    maxHeight: { default: '70dvh', [media.md]: 'none' },
    overflowY: 'auto',
    padding: space['--space-5'],
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderTopWidth: { default: 1, [media.md]: 0 },
    borderLeftWidth: { default: 0, [media.md]: 1 },
    backgroundColor: color['--color-raised'],
    boxShadow: '0 -8px 32px rgb(0 0 0 / 0.18)',
  },
  drawerHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  kicker: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-2xs'],
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: color['--color-fg-muted'],
  },
  drawerName: {
    marginBlock: space['--space-2'],
    fontFamily: font['--font-display'],
    fontSize: text['--text-xl'],
  },
  inline: { display: 'flex', flexDirection: 'column', gap: space['--space-1'] },
  details: {},
  summary: {
    cursor: 'pointer',
    fontSize: text['--text-xs'],
    color: color['--color-accent-strong'],
  },
  switcher: {
    position: 'fixed',
    left: 16,
    bottom: 16,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
    paddingBlock: space['--space-1'],
    paddingInline: space['--space-2'],
    borderRadius: radius['--radius-full'],
    backgroundColor: '#111',
    color: '#fff',
    fontSize: 12,
    fontFamily: 'ui-monospace, monospace',
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.35)',
  },
  switcherButton: {
    display: 'flex',
    border: 'none',
    background: 'none',
    color: '#fff',
    cursor: 'pointer',
    padding: 4,
  },
});
