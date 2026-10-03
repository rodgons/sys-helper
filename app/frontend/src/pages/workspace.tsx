import * as stylex from '@stylexjs/stylex';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { ArchitectureCanvas } from '../architecture/canvas';
import type { Review } from '../architecture/review';
import { ChatPane } from '../conversation/chat-pane';
import { color, layout, media, space } from '../design/tokens.stylex';
import { SidePanel } from '../knowledge/side-panel';
import { ApiError } from '../lib/api';
import { useArchitecture } from '../lib/architecture';
import { usePendingProposal } from '../lib/conversation';
import { useKnowledge } from '../lib/knowledge';
import { usePanelWidth } from '../lib/panel-width';
import { slugSuffix, useProject } from '../lib/projects';
import { ProjectSidebar } from '../projects/project-sidebar';
import { ProjectTitle } from '../projects/project-title';
import { Section, Stack } from '../ui/layout';
import { ArrowLink } from '../ui/link';
import { Display, Text } from '../ui/typography';
import { RequireUser } from './require-user';
import { CompactWorkspace, useCompact } from './workspace-mobile.prototype';

// The left pane's widths in rem, open and collapsed to a rail. The side panel's bounds depend on it.
const LEFT_OPEN_REM = 16;
const LEFT_RAIL_REM = 3;

/** `/p/:slug`: Projects on the left, the Architecture canvas in the middle, the Conversation on the right. */
export function WorkspacePage() {
  const { slug = '' } = useParams();
  return <RequireUser>{() => <Workspace slug={slug} />}</RequireUser>;
}

function Workspace({ slug }: { slug: string }) {
  const project = useProject(slug);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const panel = usePanelWidth(sidebarOpen ? LEFT_OPEN_REM : LEFT_RAIL_REM);
  const [resizing, setResizing] = useState(false);
  // The pending Proposal's review, published by the canvas so the chat can offer Accept too.
  const [review, setReview] = useState<Review | null>(null);
  // Current names of canvas items, for showing what Decisions explain.
  const [names, setNames] = useState<Record<string, string>>({});
  const compact = useCompact(); // PROTOTYPE
  const pending = usePendingProposal(slug);
  const knowledge = useKnowledge(slug);

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <main>
        <Section>
          <Stack gap={4}>
            <Display as="h1" size="sm">
              {notFound ? 'Project not found' : "Couldn't load this project"}
            </Display>
            <Text tone="muted">
              {notFound
                ? 'It may have been deleted, or the link is wrong.'
                : 'Refresh to try again.'}
            </Text>
            <ArrowLink href="/projects">Back to your projects</ArrowLink>
          </Stack>
        </Section>
      </main>
    );
  }
  if (!project.isSuccess) return null;
  // Old names and bare suffixes still resolve; always show the canonical slug.
  if (project.data.slug !== slug) return <Navigate to={`/p/${project.data.slug}`} replace />;

  // PROTOTYPE (mobile header and drawer): below 64rem render one of the compact variants.
  if (compact) {
    const p = project.data;
    return (
      <CompactWorkspace
        project={p}
        canvas={<CanvasPane slug={p.slug} onReview={setReview} onNames={setNames} />}
        panel={(tab, onTab) => (
          <SidePanel
            key={slugSuffix(slug)}
            slug={p.slug}
            names={names}
            conversation={<ChatPane slug={p.slug} review={review} />}
            open
            onToggle={() => {}}
            tab={tab}
            onTab={onTab}
            head="none"
          />
        )}
        pending={pending !== null && pending !== undefined}
        review={review}
        counts={{
          requirements: knowledge.data?.requirements.length,
          decisions: knowledge.data?.decisions.length,
          flagged: knowledge.data?.decisions.filter((d) => d.needsReview).length ?? 0,
        }}
      />
    );
  }

  return (
    <main {...stylex.props(styles.workspace, resizing && styles.resizing)}>
      <p {...stylex.props(styles.notice)}>
        The workspace works best on a screen at least 1024px wide.
      </p>
      <div
        {...stylex.props(
          styles.panes,
          sidebarOpen ? styles.withSidebar : styles.withLeftRail,
          panelOpen ? styles.withPanel(`${panel.width}px`) : styles.withRightRail,
        )}
      >
        <div {...stylex.props(styles.pane, styles.left)}>
          <ProjectSidebar
            currentSlug={slug}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
          />
        </div>
        <section aria-label="Canvas" {...stylex.props(styles.pane, styles.canvas)}>
          <div {...stylex.props(styles.bar)}>
            <ProjectTitle key={project.data.slug} project={project.data} />
          </div>
          <CanvasPane slug={project.data.slug} onReview={setReview} onNames={setNames} />
        </section>
        <aside
          id="project-panel"
          aria-label="Project panel"
          {...stylex.props(styles.pane, styles.right)}
        >
          {panelOpen && <PanelResizer panel={panel} onResizing={setResizing} />}
          <SidePanel
            key={slugSuffix(slug)}
            slug={project.data.slug}
            names={names}
            conversation={<ChatPane slug={project.data.slug} review={review} />}
            open={panelOpen}
            onToggle={() => setPanelOpen((o) => !o)}
          />
        </aside>
      </div>
    </main>
  );
}

/**
 * The border between the canvas and the side panel: drag it, or focus it and use the arrow keys
 * (Home/End jump to the bounds), to resize the panel. A double-click restores the default width.
 */
function PanelResizer({
  panel,
  onResizing,
}: {
  panel: ReturnType<typeof usePanelWidth>;
  onResizing: (resizing: boolean) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  // Moving the border left widens the panel, which sits on the right.
  const widthAt = (x: number) => (drag.current ? drag.current.width + drag.current.x - x : 0);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection, no focus jump
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (e.g. a synthetic pointer): moves over the handle still resize.
    }
    drag.current = { x: e.clientX, width: panel.width };
    onResizing(true);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) panel.set(widthAt(e.clientX));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    panel.commit(widthAt(e.clientX));
    drag.current = null;
    onResizing(false);
  }
  function onPointerCancel() {
    if (!drag.current) return;
    panel.commit(panel.width);
    drag.current = null;
    onResizing(false);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = {
      ArrowLeft: panel.width + panel.step,
      ArrowRight: panel.width - panel.step,
      Home: panel.min,
      End: panel.max,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    panel.commit(next);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> can't be focused or dragged; this is the ARIA window splitter pattern.
    <div
      role="separator"
      aria-label="Resize panel"
      aria-orientation="vertical"
      aria-controls="project-panel"
      aria-valuenow={panel.width}
      aria-valuemin={panel.min}
      aria-valuemax={panel.max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onDoubleClick={panel.reset}
      onKeyDown={onKeyDown}
      {...stylex.props(styles.resizer)}
    />
  );
}

function CanvasPane({
  slug,
  onReview,
  onNames,
}: {
  slug: string;
  onReview: (review: Review | null) => void;
  onNames: (names: Record<string, string>) => void;
}) {
  const proposal = usePendingProposal(slug);
  const architecture = useArchitecture(slug);
  if (architecture.isError) {
    return (
      <div {...stylex.props(styles.placeholder)}>
        <Text tone="muted">Couldn't load the architecture. Refresh to try again.</Text>
      </div>
    );
  }
  if (!architecture.isSuccess) return <div {...stylex.props(styles.placeholder)} />;
  // Keyed by suffix: the editor owns its state, so another Project needs a fresh one.
  return (
    <ArchitectureCanvas
      key={slugSuffix(slug)}
      slug={slug}
      initial={architecture.data}
      proposal={proposal}
      onReview={onReview}
      onNames={onNames}
    />
  );
}

const styles = stylex.create({
  // While dragging the panel's border: the resize cursor everywhere, and no text selection.
  resizing: { cursor: 'col-resize', userSelect: 'none' },
  // A hit area straddling the panel's left border, which lights up as a thicker rule.
  resizer: {
    position: 'absolute',
    zIndex: 1,
    top: 0,
    bottom: 0,
    left: `calc(${space['--space-1']} * -1)`,
    width: space['--space-2'],
    cursor: 'col-resize',
    touchAction: 'none',
    outline: 'none',
    '::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '50%',
      width: 2,
      transform: 'translateX(-50%)',
      backgroundColor: 'transparent',
    },
    ':hover::after': { backgroundColor: color['--color-accent'] },
    ':focus-visible::after': { backgroundColor: color['--color-accent'] },
    ':active::after': { backgroundColor: color['--color-accent'] },
  },
  workspace: {
    display: 'flex',
    flexDirection: 'column',
    height: `calc(100dvh - ${layout['--header-h']})`,
  },
  notice: {
    display: { default: 'block', [media.lg]: 'none' },
    margin: 0,
    padding: space['--space-3'],
    textAlign: 'center',
    backgroundColor: color['--color-accent-soft'],
    color: color['--color-fg'],
  },
  panes: {
    display: 'grid',
    gridTemplateColumns: 'var(--left-w) 1fr var(--right-w)',
    flexGrow: 1,
    minHeight: 0,
    minWidth: '64rem',
  },
  // The left and right pane widths are set independently, through the CSS variables the grid reads.
  withSidebar: { '--left-w': `${LEFT_OPEN_REM}rem` },
  withLeftRail: { '--left-w': `${LEFT_RAIL_REM}rem` },
  // The User's chosen width (`usePanelWidth`), already clamped.
  withPanel: (width: string) => ({ '--right-w': width }),
  withRightRail: { '--right-w': '3rem' },
  pane: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  left: {
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
  canvas: { backgroundColor: color['--color-subtle'] },
  bar: {
    boxSizing: 'border-box',
    height: layout['--pane-head-h'],
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingInline: space['--space-4'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
  placeholder: { display: 'grid', placeItems: 'center', flexGrow: 1 },
  right: {
    position: 'relative',
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
});
