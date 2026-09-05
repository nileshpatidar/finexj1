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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`USDT Fund Management Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is in use. Exiting process so supervisor can restart cleanly.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    cleanupManager.stop();
    const forceExitTimer = setTimeout(() => {
      console.warn('Forcing process exit after timeout.');
      process.exit(0);
    }, 1500);
    forceExitTimer.unref();

    server.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Do not call listen if running in a serverless environment (like Vercel)
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}

export { app };
