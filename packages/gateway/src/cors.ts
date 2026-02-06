import type { IncomingMessage, ServerResponse } from 'node:http';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',     // Vite dev server
  'http://127.0.0.1:5173',
  'http://localhost:3000',     // Alternative dev port
  'http://127.0.0.1:3000',
  'http://localhost:18791',    // Production dashboard
  'http://127.0.0.1:18791',
];

/**
 * Set CORS headers on response
 */
export function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin request or non-browser client
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-changed-by');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * Handle CORS preflight request
 * Returns true if this was a preflight request (OPTIONS)
 */
export function handleCorsPrefllight(req: IncomingMessage, res: ServerResponse): boolean {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  return false;
}
