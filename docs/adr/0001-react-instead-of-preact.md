# Frontend moves from Preact to React

The canvas is the core of the product, and React Flow (`@xyflow/react`) is built for React. Running it on Preact through `preact/compat` risks subtle bugs in the most important part of the app. We moved the frontend to React while the app was still nearly empty, when the switch was cheap. This replaces `@tanstack/preact-query` with `@tanstack/react-query` and removes the "preact stays on 10.x" pin.
