# React Flow v12 on touch devices

Research for issue #48 (map #45). Checked 2026-10-03 against the installed `@xyflow/react` 12.12.0 and `@xyflow/system` 0.0.83 (the source in `node_modules`), their `d3-zoom` / `d3-drag` 3.0.0 dependencies, the official React Flow docs, the xyflow issue tracker and MDN. Where the docs and the source disagree, the source wins and the difference is noted. Code references are to `app/frontend/src/architecture/` at `5c8ab8b`.

Sources:

- [ReactFlow props][props]: `reactflow.dev/api-reference/react-flow`
- [Touch device example][touch-ex]: `reactflow.dev/examples/interaction/touch-device`
- [Drag and drop example][dnd-ex]: `reactflow.dev/examples/interaction/drag-and-drop`
- [CHANGELOG][changelog]: `packages/react/CHANGELOG.md`
- Source: `@xyflow/react/dist/esm/index.mjs` (`ReactFlow`, `Pane`, `HandleComponent`, `NodeWrapper`, store defaults), `@xyflow/react/dist/style.css`, `@xyflow/system/dist/esm/index.mjs` (`createFilter`, `XYPanZoom`, `XYDrag`, `XYHandle`), `d3-zoom/src/zoom.js`, `d3-drag/src/drag.js`
- Issues: [#5712], [#4199], [#5639], [#3898], [#5341], [#5475], [#6023]
- MDN: [touch-action][mdn-ta], [Supporting both touch and mouse][mdn-both]

## What our canvas sets today

`<ReactFlow>` in `canvas.tsx` sets only `connectionMode={ConnectionMode.Loose}`, `nodesDraggable` / `nodesConnectable` (false while a review is being sent), `deleteKeyCode='Backspace'`, `fitView`, `fitViewOptions` and the click/drop handlers. Every gesture prop below is at its **default**. Handles are 8 × 8 px (`nodes.tsx`, `styles.handle`), one target on the left and one source on the right of each Component. The dock adds Components by **click** (`onAdd`) or by **HTML5 drag-and-drop** (`draggable` + `dataTransfer`, received by `onDragOver`/`onDrop` on the canvas).

## Gesture by gesture

| Gesture | What happens on touch (defaults) | Props that control it |
| --- | --- | --- |
| One-finger drag on empty pane | Pans the viewport (d3-zoom). | `panOnDrag` (default `true`). Mouse-button arrays don't restrict touch; only `false` stops touch panning ([props]). |
| One-finger drag on a Component | **Drags the Component**, not the viewport. Draggable nodes get the `nopan` class, which the pan-zoom filter rejects. | `nodesDraggable`, `nodeDragThreshold` (default 1 px). |
| Two-finger pinch | Zooms (d3-zoom touch). A pinch that *starts* on a draggable Component is filtered out (`nopan`), and a second finger on a dragging node aborts the drag (`XYDrag`: `touchmove` with `touches.length > 1`). | `zoomOnPinch` (default `true`), `minZoom` (default **0.5**), `maxZoom` (default 2). |
| Double-tap on empty pane | Zooms in. d3-zoom turns two taps within 500 ms and 10 px into its `dblclick.zoom` handler, bypassing the filter, so React Flow removes that handler when the prop is off. The fix for "`zoomOnDoubleClick={false}` has no effect on iPad" ([#3898]) shipped in 11.11.3 and is in v12. | `zoomOnDoubleClick` (default `true`). |
| Tap on a Component / Connection / pane | The browser's synthesized `click` drives `onNodeClick`, `onEdgeClick`, `onPaneClick` and selection. Connections have a 20 px invisible hit area (`interactionWidth`). | `elementsSelectable`, `nodeClickDistance` (0), `paneClickDistance` (source default **1**; the docs say 0). |
| Box selection | Off by default. With `selectionOnDrag` and `panOnDrag !== false`, touch **always pans**: `Pane.onPointerDownCapture` returns early for `pointerType === 'touch'` (12.11.3, PR #5918). Touch box-select needs `panOnDrag={false}`, which then loses one-finger panning ([#4199] open, [#5639] closed). | `selectionOnDrag`, `panOnDrag`, `selectionKeyCode` (a keyboard key, so not reachable on a phone). |
| Multi-select | Needs `multiSelectionKeyCode` (Meta/Control): no touch path apart from box selection. | — |
| Drawing a Connection by dragging | Works: `Handle` binds `onTouchStart` and `XYHandle` listens to `touchmove`/`touchend` on the document. The drop snaps to the closest handle within `connectionRadius`. Pinch is blocked while a connection is in progress (12.8.5, [#5475]). | `nodesConnectable`, `connectionRadius` (20, in flow units), `connectionDragThreshold` (1), `autoPanOnConnect`. |
| Drawing a Connection by tapping | **Tap the source handle, then the target handle** ([touch-ex]: "You can connect nodes on a touch device by tapping two handles in a row"). On by default. | `connectOnClick` (default `true`), `onClickConnectStart/End`. |
| Delete | `deleteKeyCode` is a keyboard key. A phone without a keyboard can only delete through our Inspector's Remove button. | `deleteKeyCode`. |
| Page scroll over the canvas | Never happens. `.react-flow__pane` has `touch-action: none`, so the browser does no panning, pinch-zoom or double-tap-zoom on it ([mdn-ta]), and React Flow handles everything. | `preventScrolling` only affects wheel events; the CSS rule still applies. |
| Drag from an external palette (our dock) | **Not supported with HTML5 DnD:** "HTML Drag and Drop API is not properly supported on touch devices" ([dnd-ex]). The official example uses pointer events plus `elementFromPoint` instead. | None in React Flow: this is our code. |

## Handle size

- The default CSS handle is 6 px. Ours is 8 px. That is far below a usable touch target: the official touch example enlarges the handles "so that they are better tappable" ([touch-ex]).
- There is no prop for this, only CSS, for example a `@media (pointer: coarse)` rule on `.react-flow__handle`, or a transparent larger hit area around a small visible dot.
- `connectionRadius` widens only the *drop* zone. Starting a drag or a tap-connect still needs a hit on the handle element.

## Known issues relevant to us (open as of 2026-10-03)

- [#5712] **Multi-touch can leave a dangling connection line** (12.10.1, open). Reproduced on the official touch example: start a connection, touch a node with a second finger, then lift the first finger.
- [#4199] `selectionOnDrag` doesn't work on touch while panning is on: by design since #5918. See the table above.
- [#5341] No touch equivalent of `panOnScroll` / `PanOnScrollMode` (open). It doesn't affect us, since we pan on drag.
- [#6023] Handle offsets go wrong under an ancestor CSS `transform: scale` or `zoom` (open). Relevant only if the compact layout scales the canvas container (a bottom sheet that *translates* is fine).
- **Taps on a draggable Component may not reach `onNodeClick` (inferred from the source, not reproduced).** `d3-drag` calls `preventDefault()` on every `touchmove` over a draggable node. Cancelling the first `touchmove` suppresses the compatibility mouse events and `click` ([mdn-both]). A tap that jitters a little can then select the Component, because `selectNodesOnDrag` selects on drag start once it moves past `nodeDragThreshold`, without ever firing `onNodeClick`. Our "click it again to edit" flow (`onNodeClick` → `setOpened`) depends on that click. Check this on a real device.

## What this means for "How does the canvas work by touch?"

- **Read-only exploration works out of the box:** one-finger pan on the pane, pinch zoom, double-tap zoom, tap to select a Component or Connection, tap the pane to deselect. No custom gestures needed, which matches the map's out-of-scope note.
- **Draggable Components fight panning on a small screen.** On a phone, Components cover much of the viewport, and a drag that starts on one moves it (and autosaves) instead of panning. Setting `nodesDraggable={false}` in the compact tier removes the `nopan` class, so one-finger pans and pinches work anywhere. Taps still select (`NodeWrapper` selects on click when the node isn't draggable), and it also avoids the d3-drag click suppression above. This fits "fine layout is best-effort".
- **Connections:** tap-to-connect is already on (`connectOnClick` default). It needs bigger handles under `pointer: coarse` to be usable. With `ConnectionMode.Loose`, either handle can start or end a Connection.
- **The dock's drag-to-add is moot on touch**: it uses HTML5 DnD, which React Flow's own docs say doesn't work on touch. The dock already adds on **tap** (`onClick={() => onAdd(t.type)}`, placed at the viewport centre), so touch has a path without any pointer-events rewrite.
- **Keyboard-only affordances need touch equivalents:** Backspace to delete (the Inspector's Remove exists), Esc to close (a pane tap closes), and multi-select (none; acceptable for the conversation-first scope).
- **The fit and zoom bounds are desktop-sized.** `minZoom` defaults to 0.5, so on a ~375 px-wide phone any Architecture wider than about 750 flow px can't be fitted. `fitOptions` reserves 64 px left/right, 80–180 px at the bottom and `INSPECTOR_SPACE` 300 px at the right. On a phone, those paddings use up most of the width. The compact tier needs its own `minZoom` and fit padding.
- **`touch-action: none` on the pane** means the canvas never scrolls the page. The compact layout must not put the canvas inside a scrolling container that users need to scroll past. A fixed canvas with a bottom sheet over it works.

[props]: https://reactflow.dev/api-reference/react-flow
[touch-ex]: https://reactflow.dev/examples/interaction/touch-device
[dnd-ex]: https://reactflow.dev/examples/interaction/drag-and-drop
[changelog]: https://github.com/xyflow/xyflow/blob/main/packages/react/CHANGELOG.md
[#5712]: https://github.com/xyflow/xyflow/issues/5712
[#4199]: https://github.com/xyflow/xyflow/issues/4199
[#5639]: https://github.com/xyflow/xyflow/issues/5639
[#3898]: https://github.com/xyflow/xyflow/issues/3898
[#5341]: https://github.com/xyflow/xyflow/issues/5341
[#5475]: https://github.com/xyflow/xyflow/issues/5475
[#6023]: https://github.com/xyflow/xyflow/issues/6023
[mdn-ta]: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
[mdn-both]: https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Supporting_both_TouchEvent_and_MouseEvent
