import 'dotenv/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { isLocalDemoEnabled } from './localAuth.js';

if (!process.env.VERCEL) {
  config({
    path: fileURLToPath(new URL('../../.env', import.meta.url))
  });
}
import { app } from './app.js';

const port = Number(process.env.API_PORT || 4000);

// Vercel handles the HTTP server in production.
// For local development, start Express normally.
if (!process.env.VERCEL) {
  const host = isLocalDemoEnabled() ? '127.0.0.1' : undefined;

  const onListening = () => {
    console.log(`FRIDAY Master Owner API listening on ${port}`);
  };
  // Express has distinct overloads for a port-only listener and a listener
  // bound to an explicit host. Do not pass an undefined hostname.
  if (host) app.listen(port, host, onListening);
  else app.listen(port, onListening);
}

export default app;
