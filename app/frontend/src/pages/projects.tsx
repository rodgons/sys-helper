import * as stylex from '@stylexjs/stylex';
import { Navigate } from 'react-router';
import { layout } from '../design/tokens.stylex';
import { useProjects } from '../lib/projects';
import { NewProjectForm } from '../projects/new-project-form';
import { Section, Stack } from '../ui/layout';
import { Display, Label, Text } from '../ui/typography';
import { RequireUser } from './require-user';

/** Signed-in landing page: opens the most recent Project, or offers to create the first one. */
export function ProjectsPage() {
  return <RequireUser>{(me) => <ProjectsIndex displayName={me.displayName} />}</RequireUser>;
}

function ProjectsIndex({ displayName }: { displayName: string }) {
  const projects = useProjects();

  if (projects.isError) {
    return (
      <main>
        <Section>
          <Text tone="muted">Couldn't load your projects. Refresh to try again.</Text>
        </Section>
      </main>
    );
  }
  if (!projects.isSuccess) return null;

  const [latest] = projects.data;
  if (latest) return <Navigate to={`/p/${latest.slug}`} replace />;

  return (
    <main>
      <Section>
        <Stack gap={6} xstyle={styles.narrow}>
          <Stack gap={4}>
            <Label tone="accent">Signed in as {displayName}</Label>
            <Display as="h1" size="sm">
              No projects yet
            </Display>
            <Text tone="muted">
              A project is the system you want to build. Name it, and the AI will start by asking
              what it needs to do.
            </Text>
          </Stack>
          <NewProjectForm />
        </Stack>
      </Section>
    </main>
  );
}

const styles = stylex.create({
  narrow: { maxWidth: layout['--container-narrow'] },
});
