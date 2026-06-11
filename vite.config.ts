import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Dev-only screenshot sink. The browser POSTs a PNG data URL to /__shot and we
 * write it under .claude/shots/ so it can be inspected from the terminal. Never
 * runs in a production build (apply: 'serve'); harmless if unused.
 */
function shotSink(): Plugin {
  return {
    name: 'shot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body);
            const b64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '');
            const dir = resolve(process.cwd(), '.claude/shots');
            mkdirSync(dir, { recursive: true });
            const safe = String(name || 'shot').replace(/[^a-z0-9_-]/gi, '_');
            writeFileSync(resolve(dir, `${safe}.png`), Buffer.from(b64, 'base64'));
            res.statusCode = 200;
            res.end('ok');
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [shotSink()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
