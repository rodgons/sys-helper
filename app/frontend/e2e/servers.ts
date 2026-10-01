// E2E runs its own API and Vite on dedicated ports, so `make dev` (on 8080/5173) is never reused:
// that server isn't in fake-AI mode and would call the real, paid model.
export const apiPort = 18080;
export const webPort = 15173;
export const apiUrl = `http://localhost:${apiPort}`;
export const webUrl = `http://localhost:${webPort}`;
