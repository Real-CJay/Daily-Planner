import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import coachHandler from './api/coach';

function parseEnvFallback(envFilePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(envFilePath)) return result;
  const lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function localCoachApiPlugin(mode: string): Plugin {
  return {
    name: 'local-coach-api',
    configureServer(server) {
      const viteEnv = loadEnv(mode, process.cwd(), '');
      const fileEnv = parseEnvFallback(path.resolve(process.cwd(), '.env'));
      const resolvedKey =
        viteEnv.GEMINI_API_KEY ||
        fileEnv.GEMINI_API_KEY ||
        viteEnv.VITE_GEMINI_API_KEY ||
        fileEnv.VITE_GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY;

      if (resolvedKey) {
        process.env.GEMINI_API_KEY = resolvedKey;
      }

      server.middlewares.use('/api/coach', (req, res) => {
        const chunks: Uint8Array[] = [];
        req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        req.on('end', async () => {
          let parsedBody: Record<string, unknown> = {};
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            parsedBody = raw ? JSON.parse(raw) : {};
          } catch {
            parsedBody = {};
          }

          const mockReq = { method: req.method, body: parsedBody };
          const mockRes = {
            status(code: number) {
              res.statusCode = code;
              return {
                json(payload: unknown) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(payload));
                },
              };
            },
          };

          try {
            await coachHandler(mockReq, mockRes);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Local API handler error',
              })
            );
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localCoachApiPlugin(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
  },
}));
