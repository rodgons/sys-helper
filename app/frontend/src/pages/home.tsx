import * as stylex from '@stylexjs/stylex';
import { Navigate } from 'react-router';
import { color, font, space, text } from '../design/tokens.stylex';
import { useAuth } from '../lib/auth';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Grid, Section, Stack } from '../ui/layout';
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
  if (auth.status === 'signedIn') return <Navigate to="/projects" replace />;

  return (
    <main>
      <Section>
        <Stack gap={6}>
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
            <Button size="lg" onClick={auth.signIn} disabled={auth.status === 'loading'}>
              Sign in with GitHub
            </Button>
          </div>
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
  index: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-sm'],
    color: color['--color-accent-strong'],
    paddingBottom: space['--space-2'],
  },
});
