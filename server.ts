import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db/database.ts';
import { syncCandidatesToExcel } from './server/services/excelService.ts';
import { authRouter } from './server/routes/authRoutes.ts';
import { coreRouter } from './server/routes/coreRoutes.ts';
import { interviewRouter } from './server/routes/interviewRoutes.ts';

async function startServer() {
  initDatabase();
  await syncCandidatesToExcel();

  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Simple in-memory rate limit for auth & public interview endpoints
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.use('/api/auth', (req, res, next) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    bucket.count++;
    if (bucket.count > 60) {
      res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'HireFlow AI' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', coreRouter);
  app.use('/api', interviewRouter);

  const server = http.createServer(app);

  // WebSocket server for Telephony Media Streams (/ws/media) and Browser Web Interview (/ws/web-interview)
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url || '').split('?')[0];
    if (urlPath === '/ws/media' || urlPath === '/ws/web-interview') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // Allow Vite HMR upgrade in dev or close unknown paths
    }
  });

  wss.on('connection', (ws, req) => {
    const url = req.url || '';
    ws.send(JSON.stringify({ event: 'connected', channel: url.startsWith('/ws/media') ? 'telephony' : 'web_interview' }));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string };
        if (msg.event === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', ts: Date.now() }));
        }
      } catch {
        // Ignore binary media frames until telephony stream consumer attaches
      }
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`HireFlow AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start HireFlow AI server:', err);
  process.exit(1);
});
