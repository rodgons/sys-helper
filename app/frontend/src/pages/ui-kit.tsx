import * as stylex from '@stylexjs/stylex';
import { LogOut, Settings } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { color, font, media, radius, space, text } from '../design/tokens.stylex';
import { setThemeChoice, useThemeChoice } from '../lib/theme';
import { Avatar } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { GitHubIcon, GoogleIcon } from '../ui/brand-icons';
import { Button, ButtonLink } from '../ui/button';
import { Card } from '../ui/card';
import { CommandLine } from '../ui/command-line';
import { CopyValue } from '../ui/copy-value';
import { Dialog } from '../ui/dialog';
import { Cluster, Grid, Section, Stack } from '../ui/layout';
import { ArrowLink, TextLink } from '../ui/link';
import { Logo } from '../ui/logo';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '../ui/menu';
import { MeterList } from '../ui/meter';
import { PaneToggle } from '../ui/pane-toggle';
import { SelectField } from '../ui/select-field';
import { TextArea } from '../ui/text-area';
import { TextField } from '../ui/text-field';
import { ThemeMenu } from '../ui/theme-menu';
import { toast } from '../ui/toaster';
import { Display, Heading, InlineCode, Label, Readout, Text } from '../ui/typography';

/** Living reference for the design system: every token and base component, rendered. */
export function UiKitPage() {
  const theme = useThemeChoice();
  return (
    <main>
      <Section xstyle={styles.hero}>
        <Stack gap={6}>
          <Label tone="accent">UI kit · v0</Label>
          <Display as="h1" size="lg">
            UI kit
          </Display>
          <Text size="lg" tone="muted">
            Tokens, type and base components for sys-helper. Flat surfaces, hairline borders,
            condensed headlines and a single purple accent that marks what matters.
          </Text>
          <Cluster gap={3}>
            <ButtonLink href="#buttons" size="lg">
              Browse components
            </ButtonLink>
            <ButtonLink href="#color" size="lg" variant="outline">
              View tokens
            </ButtonLink>
          </Cluster>
          <div {...stylex.props(styles.command)}>
            <CommandLine command="make dev" />
          </div>
        </Stack>
      </Section>

      <DocSection id="brand" index="00" title="Brand">
        <Text tone="muted">
          The mark: a speech bubble holding an architecture, with the AI on its corner. Its purples
          are fixed in both color schemes. <InlineCode>public/favicon.svg</InlineCode> is the same
          mark on a dark tile.
        </Text>
        <Cluster gap={6}>
          <Logo size={96} />
          <Logo size={48} />
          <Logo size={28} />
          <Logo size={16} />
        </Cluster>
      </DocSection>

      <DocSection id="color" index="01" title="Color">
        <Text tone="muted">
          Semantic roles, not raw hues. Each role has a light and a dark value and follows the
          system color scheme. <InlineCode>accent</InlineCode> is a fill that carries white text;{' '}
          <InlineCode>accent-strong</InlineCode> is the accent as readable text.
        </Text>
        <Grid columns={4} gap={4}>
          {COLOR_TOKENS.map((token) => (
            <Swatch key={token} name={token} />
          ))}
        </Grid>
      </DocSection>

      <DocSection id="typography" index="02" title="Typography">
        <Stack gap={8}>
          <Specimen meta="Display lg · condensed 800 · fluid">
            <Display as="h3" size="lg">
              Ship it faster
            </Display>
          </Specimen>
          <Specimen meta="Display md">
            <Display as="h3" size="md">
              Everything in one place
            </Display>
          </Specimen>
          <Specimen meta="Display sm">
            <Display as="h3" size="sm">
              Section headline
            </Display>
          </Specimen>
          <Specimen meta="Heading lg / md / sm · sans 700">
            <Stack gap={2}>
              <Heading size="lg">Heading large</Heading>
              <Heading size="md">Heading medium</Heading>
              <Heading size="sm">Heading small</Heading>
            </Stack>
          </Specimen>
          <Specimen meta="Text lg / md / sm · muted & faint tones">
            <Stack gap={2}>
              <Text size="lg">Lead text introduces a page or section in one or two sentences.</Text>
              <Text tone="muted">
                Body text is set in the system sans for speed and familiarity on every platform.
              </Text>
              <Text size="sm" tone="faint">
                Small text for captions, footnotes and helper copy.
              </Text>
            </Stack>
          </Specimen>
          <Specimen meta="Label · mono uppercase · Readout · tabular">
            <Stack gap={2}>
              <Label>Section label</Label>
              <Readout xstyle={styles.bigReadout}>1,284.06 ms</Readout>
            </Stack>
          </Specimen>
        </Stack>
      </DocSection>

      <DocSection id="spacing" index="03" title="Spacing & shape">
        <Grid columns={2} gap={12}>
          <Stack gap={3}>
            <Label>Spacing · 4px base</Label>
            {SPACE_TOKENS.map(([name, value]) => (
              <div key={name} {...stylex.props(styles.scaleRow)}>
                <Readout xstyle={styles.scaleName}>{name}</Readout>
                <div {...stylex.props(styles.scaleBar, styles.dynWidth(value))} />
              </div>
            ))}
          </Stack>
          <Stack gap={3}>
            <Label>Radius · mostly square</Label>
            <Cluster gap={4}>
              {RADIUS_TOKENS.map((name) => (
                <Stack key={name} gap={2} align="center">
                  <div {...stylex.props(styles.radiusBox, styles.dynRadius(`var(${name})`))} />
                  <Readout xstyle={styles.scaleName}>{name.replace('--radius-', '')}</Readout>
                </Stack>
              ))}
              <Stack gap={2} align="center">
                <div {...stylex.props(styles.radiusBox, styles.cutBox)} />
                <Readout xstyle={styles.scaleName}>cut</Readout>
              </Stack>
            </Cluster>
          </Stack>
        </Grid>
      </DocSection>

      <DocSection id="buttons" index="04" title="Buttons">
        <Text tone="muted">
          Chamfered corner, no radius, no shadow. Hover swaps fills instead of darkening them. Ghost
          buttons are pills for low-emphasis actions.
        </Text>
        <Stack gap={6}>
          {(['primary', 'secondary', 'outline', 'ghost'] as const).map((variant) => (
            <Stack key={variant} gap={2}>
              <Label>{variant}</Label>
              <Cluster gap={3}>
                <Button variant={variant} size="lg">
                  Large
                </Button>
                <Button variant={variant}>Medium</Button>
                <Button variant={variant} size="sm">
                  Small
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </Cluster>
            </Stack>
          ))}
          <Stack gap={2}>
            <Label>with a provider icon (login page)</Label>
            <Cluster gap={3}>
              <Button variant="outline" size="lg">
                <GitHubIcon />
                Continue with GitHub
              </Button>
              <Button variant="outline" size="lg">
                <GoogleIcon />
                Continue with Google
              </Button>
            </Cluster>
          </Stack>
        </Stack>
      </DocSection>

      <DocSection id="links" index="05" title="Links">
        <Stack gap={4}>
          <Text tone="muted">
            Inline links in running text are{' '}
            <TextLink href="#links">accent and underlined</TextLink>. Navigation-style links stay{' '}
            <TextLink href="#links" tone="subtle">
              quiet until hovered
            </TextLink>
            .
          </Text>
          <Cluster gap={6}>
            <ArrowLink href="#links">Read the guide</ArrowLink>
            <ArrowLink href="#links">See all components</ArrowLink>
          </Cluster>
        </Stack>
      </DocSection>

      <DocSection id="badges" index="06" title="Badges">
        <Cluster gap={2}>
          <Badge>Neutral</Badge>
          <Badge tone="accent">New</Badge>
          <Badge tone="success">Healthy</Badge>
          <Badge tone="warning">Degraded</Badge>
          <Badge tone="danger">Down</Badge>
          <Badge tone="info">Beta</Badge>
        </Cluster>
      </DocSection>

      <DocSection id="cards" index="07" title="Cards">
        <Grid columns={3} gap={4}>
          <Card>
            <Badge tone="accent">Core</Badge>
            <Heading>Feature card</Heading>
            <Text size="sm" tone="muted">
              Hairline border on a flat surface. Content stacks with a fixed rhythm.
            </Text>
          </Card>
          <Card href="#cards">
            <Label>Interactive</Label>
            <Heading>Linked card</Heading>
            <Text size="sm" tone="muted">
              The whole card is the link; the border darkens on hover.
            </Text>
          </Card>
          <Card tone="slab">
            <Label tone="accent">Slab</Label>
            <Heading xstyle={styles.onSlab}>Inverted card</Heading>
            <Text size="sm" xstyle={styles.onSlabMuted}>
              For terminals, code and the one block that should stand apart.
            </Text>
          </Card>
        </Grid>
      </DocSection>

      <DocSection id="data" index="08" title="Data display">
        <Grid columns={2} gap={12}>
          <MeterList
            label="Health checks per second · higher is better"
            unit="req/s"
            items={[
              { label: 'sys-helper', value: 182_400, highlight: true },
              { label: 'Baseline A', value: 71_250 },
              { label: 'Baseline B', value: 44_900 },
              { label: 'Baseline C', value: 18_300 },
            ]}
          />
          <Grid columns={2} gap={4}>
            <Stat label="p50 latency" value="3.1" unit="ms" />
            <Stat label="p99 latency" value="11.8" unit="ms" />
            <Stat label="Uptime" value="99.98" unit="%" />
            <Stat label="Cold start" value="42" unit="ms" />
          </Grid>
        </Grid>
        <Specimen meta="CopyValue · an id to send, e.g. on the not-allowed page">
          <CopyValue label="Google id" value="108378921029384756123" />
        </Specimen>
      </DocSection>

      <DocSection id="layout" index="09" title="Layout primitives">
        <Text tone="muted">
          <InlineCode>Container</InlineCode> caps width at 76rem with a fluid gutter.{' '}
          <InlineCode>Section</InlineCode> adds fluid vertical rhythm and an optional hairline.{' '}
          <InlineCode>Grid</InlineCode> is one column on phones, two from 40rem and up to four from
          64rem. <InlineCode>Stack</InlineCode> and <InlineCode>Cluster</InlineCode> handle flow.
        </Text>
        <Grid columns={4} gap={4}>
          {['1', '2', '3', '4'].map((n) => (
            <div key={n} {...stylex.props(styles.gridCell)}>
              <Readout>{n}</Readout>
            </div>
          ))}
        </Grid>
      </DocSection>

      <DocSection id="inputs" index="10" title="Inputs">
        <Grid columns={2} gap={6}>
          <TextField label="Project name" placeholder="e.g. URL shortener" />
          <TextField label="Hidden label" hideLabel placeholder="Label kept for screen readers" />
          <TextArea label="Text area" placeholder="Several lines, e.g. a decision's rationale" />
          <SelectField
            label="Select field"
            defaultValue="intermediate"
            options={[
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'advanced', label: 'Advanced' },
            ]}
          />
          <TextField label="Disabled" disabled defaultValue="Loading…" />
          <SelectField
            label="Disabled select"
            disabled
            options={[{ value: '', label: 'Ask in each project' }]}
          />
        </Grid>
      </DocSection>

      <DocSection id="overlays" index="11" title="Dialog & toast">
        <Overlays />
      </DocSection>

      <DocSection id="account" index="12" title="Avatar, menu & theme">
        <Cluster gap={3}>
          <Avatar name="octocat" src="https://github.com/octocat.png" />
          <Avatar name="octocat" />
          <Avatar name="octocat" size={24} />
          <Avatar name="octocat" src="https://github.com/octocat.png" size={48} />
          <Menu label="Account" trigger={<Avatar name="octocat" />}>
            <MenuHeader>
              <Text size="sm" tone="muted">
                Signed in as
              </Text>
              octocat
            </MenuHeader>
            <MenuSeparator />
            <MenuItem icon={Settings} onSelect={() => toast.info('Settings (not really).')}>
              Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={LogOut} onSelect={() => toast.info('Signed out (not really).')}>
              Sign out
            </MenuItem>
          </Menu>
          {/* Wired to the real theme, so the whole kit can be checked in both schemes. */}
          <ThemeMenu choice={theme} onChange={setThemeChoice} />
          <ThemeMenu choice={theme} onChange={setThemeChoice} placement="above" />
        </Cluster>
      </DocSection>

      <DocSection id="panes" index="13" title="Pane toggle">
        <PaneToggles />
      </DocSection>
    </main>
  );
}

function PaneToggles() {
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  return (
    <Cluster gap={3}>
      <PaneToggle side="left" name="projects" open={left} onToggle={() => setLeft((o) => !o)} />
      <PaneToggle side="right" name="panel" open={right} onToggle={() => setRight((o) => !o)} />
    </Cluster>
  );
}

function Overlays() {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Label>Dialog · confirm / form</Label>
        <Cluster gap={3}>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Confirm dialog
          </Button>
          <Button variant="outline" onClick={() => setFormOpen(true)}>
            Form dialog
          </Button>
        </Cluster>
      </Stack>
      <Stack gap={2}>
        <Label>Toast · success / error / info / warning</Label>
        <Cluster gap={3}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.success('“URL Shortener” was deleted.')}
          >
            Success
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.error("Couldn't save your settings. Try again.")}
          >
            Error
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast.info('Proposal superseded.')}>
            Info
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.warning('This Proposal is out of date.')}
          >
            Warning
          </Button>
        </Cluster>
      </Stack>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete “URL Shortener”?"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Delete project
            </Button>
          </>
        }
      >
        <Text size="sm" tone="muted">
          A confirmation for an action that can’t be undone.
        </Text>
      </Dialog>
      <FormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </Stack>
  );
}

/** A form in a Dialog: the submit button lives in `actions`, tied to the form by `form={id}`. */
function FormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const formId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm">
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          toast.success('Settings saved.');
          onClose();
        }}
        {...stylex.props(styles.dialogForm)}
      >
        <SelectField
          label="Default experience level"
          options={[
            { value: '', label: 'Ask in each project' },
            { value: 'beginner', label: 'Beginner' },
          ]}
        />
        <Text size="sm" tone="muted">
          Helper copy sits under the field in muted small text.
        </Text>
      </form>
    </Dialog>
  );
}

function DocSection({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Section ruled id={id} aria-labelledby={`${id}-title`}>
      <div {...stylex.props(styles.docSection)}>
        <Stack gap={3}>
          <Label>{index}</Label>
          <Display id={`${id}-title`} size="sm">
            {title}
          </Display>
        </Stack>
        <Stack gap={8}>{children}</Stack>
      </div>
    </Section>
  );
}

function Specimen({ meta, children }: { meta: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.specimen)}>
      <Label>{meta}</Label>
      {children}
    </div>
  );
}

function Swatch({ name }: { name: string }) {
  return (
    <div {...stylex.props(styles.swatch)}>
      <div {...stylex.props(styles.swatchChip, styles.dynBg(`var(${name})`))} />
      <Readout xstyle={styles.swatchName}>{name.replace('--color-', '')}</Readout>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <Card padding="sm">
      <Label>{label}</Label>
      <Readout xstyle={styles.statValue}>
        {value}
        <span {...stylex.props(styles.statUnit)}>{unit}</span>
      </Readout>
    </Card>
  );
}

const COLOR_TOKENS = [
  '--color-canvas',
  '--color-subtle',
  '--color-surface',
  '--color-raised',
  '--color-line',
  '--color-line-strong',
  '--color-fg',
  '--color-fg-muted',
  '--color-fg-faint',
  '--color-accent',
  '--color-accent-strong',
  '--color-accent-soft',
  '--color-on-accent',
  '--color-slab',
  '--color-on-slab',
  '--color-success',
  '--color-warning',
  '--color-danger',
  '--color-info',
];

const SPACE_TOKENS = [
  ['1', space['--space-1']],
  ['2', space['--space-2']],
  ['3', space['--space-3']],
  ['4', space['--space-4']],
  ['6', space['--space-6']],
  ['8', space['--space-8']],
  ['12', space['--space-12']],
  ['16', space['--space-16']],
] as const;

const RADIUS_TOKENS = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-full'];

const styles = stylex.create({
  hero: {
    paddingTop: { default: space['--space-12'], [media.md]: space['--space-16'] },
  },
  command: { maxWidth: '28rem', width: '100%' },
  dialogForm: { display: 'flex', flexDirection: 'column', gap: space['--space-3'] },
  docSection: {
    display: 'grid',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', [media.lg]: '16rem minmax(0, 1fr)' },
    gap: { default: space['--space-8'], [media.lg]: space['--space-12'] },
  },
  specimen: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    paddingBottom: space['--space-8'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
  },
  bigReadout: { fontSize: text['--text-2xl'], fontWeight: 700 },
  swatch: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
  },
  swatchChip: {
    height: 64,
    borderRadius: radius['--radius-md'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
  },
  swatchName: { fontSize: text['--text-xs'], color: color['--color-fg-muted'] },
  dynBg: (value: string) => ({ backgroundColor: value }),
  scaleRow: {
    display: 'grid',
    gridTemplateColumns: '2rem minmax(0, 1fr)',
    alignItems: 'center',
    gap: space['--space-3'],
  },
  scaleName: { fontSize: text['--text-xs'], color: color['--color-fg-muted'] },
  scaleBar: { height: 12, backgroundColor: color['--color-accent'] },
  dynWidth: (value: string) => ({ width: value }),
  radiusBox: {
    width: 56,
    height: 56,
    backgroundColor: color['--color-accent-soft'],
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: color['--color-accent'],
  },
  dynRadius: (value: string) => ({ borderRadius: value }),
  cutBox: {
    borderWidth: 0,
    backgroundColor: color['--color-accent'],
    clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
  },
  onSlab: { color: color['--color-on-slab'] },
  onSlabMuted: { color: `color-mix(in srgb, ${color['--color-on-slab']} 70%, transparent)` },
  statValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: space['--space-1'],
    fontSize: text['--text-2xl'],
    fontWeight: 700,
    color: color['--color-fg'],
  },
  statUnit: { fontSize: text['--text-sm'], fontWeight: 500, color: color['--color-fg-faint'] },
  gridCell: {
    display: 'grid',
    placeItems: 'center',
    height: 72,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color['--color-line-strong'],
    borderRadius: radius['--radius-md'],
    fontFamily: font['--font-mono'],
    color: color['--color-fg-muted'],
  },
});
