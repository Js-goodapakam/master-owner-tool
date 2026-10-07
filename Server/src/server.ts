import 'dotenv/config';
import { app } from './app.js';

const port = Number(process.env.API_PORT || 4000);

// Vercel handles the HTTP server in production.
// For local development, start Express normally.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`FRIDAY Master Owner API listening on ${port}`);
  });
}

export default app;