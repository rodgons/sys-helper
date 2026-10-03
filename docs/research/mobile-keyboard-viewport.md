# Mobile virtual keyboard and the viewport

Research for issue #49 (map #45). Checked 2026-10-03 against the specs, MDN, the Chrome developers blog, Firefox release notes, the WebKit bug tracker and MDN's browser-compat-data (BCD 8.1.4, 2026-10-01). Each claim cites the source that owns it. Code references are to `5c8ab8b`.

Question: on iOS Safari and Android Chrome, how do `dvh`/`svh`/`lvh`, the `visualViewport` API and the `interactive-widget` viewport meta behave when the virtual keyboard opens? What keeps a chat composer inside a bottom sheet visible above the keyboard without the layout jumping?

Sources:

- [CSS Values 4, viewport-percentage lengths][values]
- [CSS Viewport 1, `interactive-widget`][viewport]
- [Chrome: viewport resize behavior changes (Chrome 108)][chrome108]
- [Chrome: VirtualKeyboard API][vk]
- [MDN: viewport meta][mdn-meta], [MDN: Visual Viewport API][mdn-vv]
- [Firefox for Android 132 release notes][ff132]
- [WebKit bug 259770: implement `interactive-widget`][wk259770], [WebKit bug 230225: VirtualKeyboard API][wk230225]
- [MDN browser-compat-data][bcd] (support versions below)

## Current state of the app

- `app/frontend/index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`, so no `interactive-widget`.
- `app/frontend/src/pages/workspace.tsx:250`: the workspace grid is `height: calc(100dvh - var(--header-h))`.
- `app/frontend/src/conversation/chat-pane.tsx`: the composer is a `<textarea rows={3}>` at the end of the pane, styled `fontSize: text['--text-sm']` (0.875rem = 14px).

## 1. Two viewports, three keyboard modes

- **Layout viewport and visual viewport.** "User-interface features like the on-screen keyboard (OSK) can shrink the visual viewport without affecting the layout viewport" ([mdn-vv]). `window.visualViewport` exposes `width`, `height`, `offsetTop`, `offsetLeft`, `pageTop`, `scale` and fires `resize`, `scroll` and `scrollend` ([mdn-vv]).
- **`interactive-widget`** is a viewport meta key with three values ([viewport]):
  - `resizes-visual`: widgets "MUST resize the visual viewport but MUST NOT resize the initial viewport". **This is the default** when the key is missing or invalid.
  - `resizes-content`: widgets "MUST resize the initial viewport". The initial containing block shrinks, and the visual viewport with it.
  - `overlays-content`: resizes neither, the same as `navigator.virtualKeyboard.overlaysContent = true`.
- **Effect on viewport units.** Under `resizes-visual`, "the computed values for viewport-relative units remain the same" and `position: fixed` elements stay where they were, so they end up behind the keyboard. Under `resizes-content`, viewport-relative units shrink with the keyboard ([chrome108]).
- **`dvh` does not track the keyboard by default.** `dv*` units follow "UA interfaces that are dynamically expanded and retracted" (the URL bar), but "UAs may have some dynamically-shown interfaces that intentionally overlay content and do not cause any shifts in layout, and therefore have no effect on any of the viewport-percentage lengths. (Typically on-screen keyboards will fit into this category.)" ([values]). So `calc(100dvh - header)` stays full height when the keyboard opens, unless the page opts into `resizes-content`.

## 2. What each browser does

| Browser | Default when keyboard opens | `interactive-widget` | VirtualKeyboard API / `env(keyboard-inset-*)` | `visualViewport` | `dvh` |
| --- | --- | --- | --- | --- | --- |
| Chrome Android | `resizes-visual` since 108 ([chrome108]) | 108 | 94 | 61 | 108 |
| Samsung Internet | (Chromium) | 21.0 | (Chromium) | yes | yes |
| Firefox Android | `resizes-visual` since 132 ([ff132]); was `resizes-content` ([chrome108]) | 133 | no ([bugzil.la/1730568][bcd]) | 68 | 101 |
| iOS Safari (all iOS browsers use WebKit) | `resizes-visual` ([chrome108]) | **no** | **no** ([wk230225]) | 13 | 15.4 |

Versions are from [bcd] unless cited otherwise. Notes:

- **Safari has not shipped `interactive-widget`.** WebKit bug 259770 is still `NEW` (opened 2023-08-03, last touched 2026-09-17). A June 2026 comment mentions a WebKit feature flag of unclear status ([wk259770]). The WebKit release posts for Safari 26.0 through 27.0 don't mention it. Plan as if iOS ignores the key.
- **The VirtualKeyboard API is Chromium-only** ("available from Chromium 94 on desktop and mobile"; Firefox and Safari don't support it ([vk])). On Android it duplicates what `interactive-widget=resizes-content` already gives in CSS, and it does nothing on iOS.

## 3. What this means for a composer in a bottom sheet

The workspace is an app shell: a fixed-height grid whose document doesn't scroll. That is the case the defaults handle worst.

- **Android (Chrome, Samsung, Firefox) with today's meta:** the keyboard covers the bottom of the visual viewport, while the grid keeps its `100dvh` height. The bottom sheet's composer lands under the keyboard. The browser then scrolls the visual viewport to reveal the focused field, which shifts the whole shell, header included.
- **Android with `interactive-widget=resizes-content`:** the initial containing block and `dvh` shrink to the space above the keyboard ([viewport], [chrome108]). `calc(100dvh - header)` recomputes, the grid reflows, and a sheet anchored to the bottom of the grid sits directly above the keyboard. No JS needed. The cost is one reflow when the keyboard opens or closes, which the default avoids on purpose ([ff132]).
- **iOS Safari (any meta):** the layout viewport, ICB and `dvh` stay full height. The keyboard overlays the page. WebKit then pans the visual viewport (`visualViewport.offsetTop > 0`) to bring the focused field into view, so the header slides off the top and the canvas jumps. The only first-party signal is `visualViewport` ([mdn-vv]): its `height` is the space above the keyboard, and `offsetTop` is how far Safari panned.

## Recommendation

1. **Add `interactive-widget=resizes-content` to the viewport meta** in `index.html`. That fixes every Android browser with CSS alone, because the existing `100dvh` sizing then follows the keyboard. Keep `overlays-content` and the VirtualKeyboard API out: both are Chromium-only, and they would make the app handle insets by hand.
2. **Add a small `visualViewport` fallback for iOS**, active only below `lg` while a text field in the shell has focus. On `visualViewport` `resize` and `scroll`, write `visualViewport.height` to a CSS custom property on the shell and size the shell with it, falling back to `100dvh` when the property is unset. Undo Safari's pan (`offsetTop`) by pinning the shell to the visual viewport, either with `position: fixed; top: 0` plus `translateY(offsetTop)`, or by scrolling the window back to 0. On Android with `resizes-content`, `visualViewport.height` already equals the shrunken viewport, so the same code is a no-op. The exact technique (translate or scroll reset) and its jank on a real iPhone belong in the bottom-sheet prototype. No primary source documents Safari's panning in enough detail to pick one on paper.
3. **Give the composer (and every text field on compact) at least 16px text.** The composer uses `--text-sm` (14px). iOS Safari zooms the page when a focused field's text is under 16px, and the zoom stays after blur. That shifts the layout far more than the keyboard does. This is long-standing WebKit behaviour that Apple doesn't document in a primary source (it appears only in developer write-ups), so verify it on a device. Do not "fix" it with `maximum-scale=1` / `user-scalable=no`: they block pinch-zoom, an accessibility regression.
4. **Keep `dvh` for the shell height.** `svh` would leave a gap when Chrome's URL bar hides, and `lvh` would put the composer under the URL bar. `dvh` is the only unit that `resizes-content` makes follow the keyboard.
5. **Testing.** Playwright's mobile emulation sets the viewport size and touch, but it doesn't open a virtual keyboard, so it can't exercise any of this. Cover the CSS through E2E at a phone viewport, and check the keyboard on a real iPhone and Android phone (or the iOS Simulator) before calling the compact layout done.

[values]: https://www.w3.org/TR/css-values-4/#viewport-variants
[viewport]: https://drafts.csswg.org/css-viewport/#interactive-widget-section
[chrome108]: https://developer.chrome.com/blog/viewport-resize-behavior
[vk]: https://developer.chrome.com/docs/web-platform/virtual-keyboard
[mdn-meta]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
[mdn-vv]: https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
[ff132]: https://www.firefox.com/en-US/firefox/android/132.0/releasenotes/
[wk259770]: https://bugs.webkit.org/show_bug.cgi?id=259770
[wk230225]: https://bugs.webkit.org/show_bug.cgi?id=230225
[bcd]: https://github.com/mdn/browser-compat-data
