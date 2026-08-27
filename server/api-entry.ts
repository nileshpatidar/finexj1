import type { Request, Response } from 'express';
import { app } from './app';

export default function handler(req: Request, res: Response) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
