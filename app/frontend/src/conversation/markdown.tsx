import * as stylex from '@stylexjs/stylex';
import { createContext, useContext } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { color, font, radius, space, text } from '../design/tokens.stylex';

/** Lets `code` tell a fenced block (inside `pre`) from inline code. */
const InBlock = createContext(false);

const components: Components = {
  p: ({ children }) => <p {...stylex.props(styles.block)}>{children}</p>,
  h1: ({ children }) => <h3 {...stylex.props(styles.block, styles.heading)}>{children}</h3>,
  h2: ({ children }) => <h3 {...stylex.props(styles.block, styles.heading)}>{children}</h3>,
  h3: ({ children }) => <h4 {...stylex.props(styles.block, styles.heading)}>{children}</h4>,
  h4: ({ children }) => <h4 {...stylex.props(styles.block, styles.heading)}>{children}</h4>,
  ul: ({ children }) => <ul {...stylex.props(styles.block, styles.list)}>{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} {...stylex.props(styles.block, styles.list)}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li {...stylex.props(styles.item)}>{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" {...stylex.props(styles.link)}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote {...stylex.props(styles.block, styles.quote)}>{children}</blockquote>
  ),
  hr: () => <hr {...stylex.props(styles.rule)} />,
  pre: ({ children }) => (
    <InBlock.Provider value={true}>
      <pre {...stylex.props(styles.block, styles.pre)}>{children}</pre>
    </InBlock.Provider>
  ),
  code: function Code({ children }) {
    const inBlock = useContext(InBlock);
    return <code {...stylex.props(styles.code, !inBlock && styles.inlineCode)}>{children}</code>;
  },
  table: ({ children }) => (
    <div {...stylex.props(styles.block, styles.tableWrap)}>
      <table {...stylex.props(styles.table)}>{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th style={style} {...stylex.props(styles.cell, styles.headCell)}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} {...stylex.props(styles.cell)}>
      {children}
    </td>
  ),
};

/**
 * Renders an AI Message's markdown (GitHub-flavored), sized for the chat. Raw HTML in the text is
 * shown as text, never rendered.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div {...stylex.props(styles.root)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    fontSize: text['--text-sm'],
    lineHeight: 1.55,
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  block: { margin: 0 },
  heading: { fontSize: text['--text-sm'], fontWeight: 700, lineHeight: 1.4 },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-1'],
    paddingInlineStart: space['--space-5'],
  },
  item: { paddingInlineStart: space['--space-1'] },
  link: {
    color: color['--color-accent-strong'],
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  quote: {
    paddingInlineStart: space['--space-3'],
    borderInlineStartWidth: 2,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: color['--color-line-strong'],
    color: color['--color-fg-muted'],
  },
  rule: {
    width: '100%',
    margin: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  pre: {
    padding: space['--space-3'],
    overflowX: 'auto',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-surface'],
  },
  code: { fontFamily: font['--font-mono'], fontSize: text['--text-xs'] },
  inlineCode: {
    paddingInline: '0.3em',
    paddingBlock: '0.1em',
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-surface'],
  },
  tableWrap: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: text['--text-xs'] },
  cell: {
    paddingInline: space['--space-2'],
    paddingBlock: space['--space-1'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    textAlign: 'start',
    verticalAlign: 'top',
  },
  headCell: { fontWeight: 600, backgroundColor: color['--color-surface'] },
});
