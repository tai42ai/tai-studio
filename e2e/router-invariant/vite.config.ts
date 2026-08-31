import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Serves the self-contained router entry-state fixture (index.html + src/main.tsx).
// `root` is pinned to this config's own folder so the dev server finds the fixture
// regardless of the cwd Playwright launches it from.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  // Bind the IPv4 loopback explicitly: `localhost` can resolve to ::1 on CI
  // runners, leaving playwright's 127.0.0.1 readiness probe refused forever.
  server: { host: '127.0.0.1', port: 5233, strictPort: true },
});
