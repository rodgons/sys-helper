import {
  Archive,
  Database,
  DoorOpen,
  Globe,
  type LucideIcon,
  MonitorSmartphone,
  Plug,
  Search,
  Server,
  Shapes,
  Signpost,
  Split,
  Workflow,
  Zap,
} from 'lucide-react';

// How each Component type looks: a Lucide icon (the dock and the node caption) and the outline its
// node is drawn in. Unknown types look like 'custom'.

export type ShapeName =
  | 'rounded'
  | 'stadium'
  | 'ellipse'
  | 'cloud'
  | 'hexagon'
  | 'chevron'
  | 'cylinder'
  | 'octagon'
  | 'pipe'
  | 'bucket'
  | 'document'
  | 'parallelogram';

type Look = { icon: LucideIcon; shape: ShapeName };

const LOOKS: Record<string, Look> = {
  client: { icon: MonitorSmartphone, shape: 'stadium' },
  dns: { icon: Signpost, shape: 'ellipse' },
  cdn: { icon: Globe, shape: 'cloud' },
  load_balancer: { icon: Split, shape: 'hexagon' },
  api_gateway: { icon: DoorOpen, shape: 'chevron' },
  service: { icon: Server, shape: 'rounded' },
  database: { icon: Database, shape: 'cylinder' },
  cache: { icon: Zap, shape: 'octagon' },
  queue: { icon: Workflow, shape: 'pipe' },
  object_store: { icon: Archive, shape: 'bucket' },
  search_index: { icon: Search, shape: 'document' },
  external_service: { icon: Plug, shape: 'parallelogram' },
  custom: { icon: Shapes, shape: 'rounded' },
};

export const lookOf = (type: string): Look => LOOKS[type] ?? (LOOKS.custom as Look);

type Shape = {
  /** The filled outline, as an SVG path for a node of w × h pixels. */
  outline: (w: number, h: number) => string;
  /** Extra unfilled strokes, such as the visible rim of a cylinder. */
  detail?: (w: number, h: number) => string;
  /** Padding that keeps the text inside the outline: top, right, bottom, left. */
  pad: [number, number, number, number];
  /** How far in from the left and right edges the outline is at mid-height, where the handles go. */
  inset?: (w: number, h: number) => [left: number, right: number];
};

const cap = (h: number) => Math.min(10, h * 0.14); // cylinder rim height
const point = (h: number) => Math.min(18, h / 2); // hexagon and chevron point depth

export const SHAPES: Record<ShapeName, Shape> = {
  rounded: {
    outline: (w, h) => roundedRect(w, h, 10),
    pad: [8, 12, 8, 12],
  },
  stadium: {
    outline: (w, h) => roundedRect(w, h, h / 2),
    pad: [8, 22, 8, 22],
  },
  ellipse: {
    outline: (w, h) =>
      `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2} Z`,
    pad: [12, 30, 12, 30],
  },
  cloud: {
    // Drawn on a 100 × 100 grid and stretched to the node: a cloud survives the distortion.
    outline: (w, h) => {
      const p = (x: number, y: number) => `${(x * w) / 100},${(y * h) / 100}`;
      return `M${p(18, 100)} C${p(4, 100)} ${p(-2, 80)} ${p(6, 66)} C${p(-2, 50)} ${p(8, 30)} ${p(24, 32)} C${p(26, 6)} ${p(50, 0)} ${p(60, 16)} C${p(72, 0)} ${p(96, 8)} ${p(92, 34)} C${p(104, 42)} ${p(104, 66)} ${p(94, 74)} C${p(100, 92)} ${p(88, 102)} ${p(76, 100)} Z`;
    },
    pad: [20, 22, 12, 22],
    inset: (w) => [w * 0.03, w * 0.03],
  },
  hexagon: {
    outline: (w, h) => {
      const k = point(h);
      return `M${k},0 H${w - k} L${w},${h / 2} L${w - k},${h} H${k} L0,${h / 2} Z`;
    },
    pad: [8, 22, 8, 22],
  },
  chevron: {
    outline: (w, h) => {
      const k = point(h);
      return `M0,0 H${w - k} L${w},${h / 2} L${w - k},${h} H0 L${k},${h / 2} Z`;
    },
    pad: [8, 22, 8, 24],
    inset: (_, h) => [point(h), 0],
  },
  cylinder: {
    outline: (w, h) => {
      const r = cap(h);
      return `M0,${r} A${w / 2},${r} 0 0 1 ${w},${r} V${h - r} A${w / 2},${r} 0 0 1 0,${h - r} Z`;
    },
    detail: (w, h) => {
      const r = cap(h);
      return `M0,${r} A${w / 2},${r} 0 0 0 ${w},${r}`;
    },
    pad: [22, 12, 12, 12],
  },
  octagon: {
    outline: (w, h) => {
      const c = Math.min(10, h / 4);
      return `M${c},0 H${w - c} L${w},${c} V${h - c} L${w - c},${h} H${c} L0,${h - c} V${c} Z`;
    },
    pad: [8, 14, 8, 14],
  },
  pipe: {
    outline: (w, h) => {
      const r = Math.min(12, w * 0.08);
      return `M${r},0 H${w - r} A${r},${h / 2} 0 0 1 ${w - r},${h} H${r} A${r},${h / 2} 0 0 1 ${r},0 Z`;
    },
    detail: (w, h) => {
      const r = Math.min(12, w * 0.08);
      return `M${w - r},0 A${r},${h / 2} 0 0 0 ${w - r},${h}`;
    },
    pad: [8, 30, 8, 20],
  },
  bucket: {
    outline: (w, h) => {
      const d = Math.min(12, w * 0.08);
      return `M0,0 H${w} L${w - d},${h} H${d} Z`;
    },
    pad: [8, 18, 8, 18],
    inset: (w) => {
      const half = Math.min(12, w * 0.08) / 2;
      return [half, half];
    },
  },
  document: {
    outline: (w, h) => {
      const wave = Math.min(8, h * 0.12);
      return `M0,0 H${w} V${h - wave} C${w * 0.7},${h - wave * 2.6} ${w * 0.3},${h + wave * 0.8} 0,${h - wave} Z`;
    },
    pad: [8, 12, 16, 12],
  },
  parallelogram: {
    outline: (w, h) => {
      const k = Math.min(14, h / 3);
      return `M${k},0 H${w} L${w - k},${h} H0 Z`;
    },
    pad: [8, 22, 8, 22],
    inset: (_, h) => {
      const half = Math.min(14, h / 3) / 2;
      return [half, half];
    },
  },
};

function roundedRect(w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
}
