// Vercel entry point: every /api/* request is rewritten here (see vercel.json).
import { handle } from '../lib/router.js';

export const config = { maxDuration: 60 };

export default function handler(req, res) {
  return handle(req, res);
}
