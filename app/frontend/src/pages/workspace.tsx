import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { ArchitectureCanvas } from '../architecture/canvas';
import type { Review } from '../architecture/review';
import { ChatPane } from '../conversation/chat-pane';
import { color, layout, media, space } from '../design/tokens.stylex';
import { ApiError } from '../lib/api';
import { useArchitecture } from '../lib/architecture';
import { usePendingProposal } from '../lib/conversation';
import { slugSuffix, useProject } from '../lib/projects';
import { ProjectSidebar } from '../projects/project-sidebar';
import { ProjectTitle } from '../projects/project-title';
import { Section, Stack } from '../ui/layout';
import { ArrowLink } from '../ui/link';
import { Display, Text } from '../ui/typography';
import { RequireUser } from './require-user';

/** `/p/:slug`: Projects on the left, the Architecture canvas in the middle, the Conversation on the right. */
export function WorkspacePage() {
  const { slug = '' } = useParams();
  return <RequireUser>{(me) => <Workspace slug={slug} username={me.username} />}</RequireUser>;
}

function Workspace({ slug, username }: { slug: string; username: string }) {
  const project = useProject(slug);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // The pending Proposal's review, published by the canvas so the chat can offer Accept too.
  const [review, setReview] = useState<Review | null>(null);

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

  return (
    <main {...stylex.props(styles.workspace)}>
      <p {...stylex.props(styles.notice)}>
        The workspace works best on a screen at least 1024px wide.
      </p>
      <div {...stylex.props(styles.panes, sidebarOpen ? styles.withSidebar : styles.withRail)}>
        <div {...stylex.props(styles.pane, styles.left)}>
          <ProjectSidebar
            currentSlug={slug}
            username={username}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
          />
        </div>
        <section aria-label="Canvas" {...stylex.props(styles.pane, styles.canvas)}>
          <div {...stylex.props(styles.bar)}>
            <ProjectTitle key={project.data.slug} project={project.data} />
          </div>
          <CanvasPane slug={project.data.slug} onReview={setReview} />
        </section>
        <aside aria-label="Conversation" {...stylex.props(styles.pane, styles.right)}>
          <ChatPane key={slugSuffix(slug)} slug={project.data.slug} review={review} />
        </aside>
      </div>
    </main>
  );
}

function CanvasPane({
  slug,
  onReview,
}: {
  slug: string;
  onReview: (review: Review | null) => void;
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
    />
  );
}

const styles = stylex.create({
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
    flexGrow: 1,
    minHeight: 0,
    minWidth: '64rem',
  },
  withSidebar: { gridTemplateColumns: '16rem 1fr 24rem' },
  withRail: { gridTemplateColumns: '3rem 1fr 24rem' },
  pane: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  left: {
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
  canvas: { backgroundColor: color['--color-subtle'] },
  bar: {
    paddingInline: space['--space-4'],
    paddingBlock: space['--space-3'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
  placeholder: { display: 'grid', placeItems: 'center', flexGrow: 1 },
  right: {
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
});
