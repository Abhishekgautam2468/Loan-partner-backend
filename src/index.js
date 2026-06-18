import app from './app.js';
import env from './config/env.js';
import { connectDB } from './config/db.js';

(async () => {
  try {
    await connectDB();
    app.listen(env.port, () => {
      console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  }
})();
