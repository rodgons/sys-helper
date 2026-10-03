import * as stylex from '@stylexjs/stylex';
import { Navigate } from 'react-router';
import workspaceDark from '../assets/workspace-dark.webp';
import workspaceLight from '../assets/workspace-light.webp';
import { color, font, radius, space, text } from '../design/tokens.stylex';
import { useAuth } from '../lib/auth';
import { useThemeChoice } from '../lib/theme';
import { ButtonRouteLink } from '../ui/button';
import { Card } from '../ui/card';
import { Grid, Section, Stack } from '../ui/layout';
import { Logo } from '../ui/logo';
import { Display, Heading, Label, Text } from '../ui/typography';

const STEPS = [
  {
    title: 'Describe what you are building',
    body: 'Tell the AI about your product in plain words: who uses it and what it has to do.',
  },
  {
    title: 'Answer its questions',
    body: 'It asks about traffic, data and constraints, and keeps your answers as the requirements every choice must meet.',
  },
  {
    title: 'Get an architecture with reasons',
    body: 'Each change arrives as a proposal you accept or reject, with the pattern it uses and what it was chosen over. Edit the canvas by hand any time.',
  },
];

/** Public landing page. Signed-in Users go straight to their projects. */
export function HomePage() {
  const auth = useAuth();
  const theme = useThemeChoice();
  if (auth.status === 'signedIn') return <Navigate to="/projects" replace />;

  return (
    <main>
      <Section>
        <Stack gap={6}>
          <Logo size={72} />
          <Label tone="accent">System design, explained</Label>
          <Display as="h1" size="lg">
            Design an architecture that scales, and learn why it works.
          </Display>
          <Text size="lg" tone="muted">
            sys-helper pairs a system design canvas with an AI architect. Build the design yourself,
            or talk it through and let the AI propose components, connections and the trade-offs
            behind each one.
          </Text>
          <div>
            <ButtonRouteLink to="/login" size="lg">
              Get started
            </ButtonRouteLink>
          </div>
        </Stack>
      </Section>

      <Section ruled aria-labelledby="preview">
        <Stack gap={8}>
          <Stack gap={3}>
            <Label tone="accent">Inside the workspace</Label>
            <Display as="h2" size="sm" id="preview">
              Your design, its reasons and the conversation, side by side
            </Display>
          </Stack>
          <figure {...stylex.props(styles.figure)}>
            {/* Recaptured by `make demo-screenshots`; the scheme matches the visitor's theme. */}
            <picture>
              {theme === 'system' && (
                <source srcSet={workspaceDark} media="(prefers-color-scheme: dark)" />
              )}
              <img
                src={theme === 'dark' ? workspaceDark : workspaceLight}
                width={2880}
                height={1800}
                alt="The sys-helper workspace: a social app's architecture canvas in the middle, and the AI's conversation on the right with a pending proposal to add hashtag search."
                {...stylex.props(styles.shot)}
              />
            </picture>
            <figcaption {...stylex.props(styles.caption)}>
              The AI proposed hashtag search. Its new components are dashed on the canvas until you
              accept or reject the proposal, and the requirements and decisions it relies on sit in
              their own tabs.
            </figcaption>
          </figure>
        </Stack>
      </Section>

      <Section ruled aria-labelledby="how-it-works">
        <Stack gap={8}>
          <Display as="h2" size="sm" id="how-it-works">
            How it works
          </Display>
          <Grid columns={3} gap={4}>
            {STEPS.map((step, i) => (
              <Card key={step.title} padding="lg">
                <Stack gap={3}>
                  <span {...stylex.props(styles.index)}>{String(i + 1).padStart(2, '0')}</span>
                  <Heading as="h3" size="md">
                    {step.title}
                  </Heading>
                  <Text tone="muted">{step.body}</Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        </Stack>
      </Section>
    </main>
  );
}

const styles = stylex.create({
  figure: {
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
  },
  shot: {
    display: 'block',
    width: '100%',
    height: 'auto',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-lg'],
  },
  caption: {
    fontSize: text['--text-sm'],
    color: color['--color-fg-muted'],
  },
  index: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-sm'],
    color: color['--color-accent-strong'],
    paddingBottom: space['--space-2'],
  },
});
