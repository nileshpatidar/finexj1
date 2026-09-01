import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app } from './server/app';
import { cleanupManager } from './server/cleanup';

const PORT = 3000;

// ==========================================
// VITE MIDDLEWARE & SERVER INITIALIZATION
// (Only used for Local Development & Container Hosting)
// ==========================================

async function startServer() {
  // Start periodic log retention & storage cleanup (Supabase source of truth)
  cleanupManager.startPeriodicCleanup();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`USDT Fund Management Server running on http://localhost:${PORT}`);
  });
}

// Do not call listen if running in a serverless environment (like Vercel)
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export { app };
