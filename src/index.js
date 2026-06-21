import app from './app.js';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import { promoteStalePartnerApplications } from './services/partnerLifecycle.js';

const LIFECYCLE_INTERVAL_MS = 60 * 60 * 1000; // hourly sweep (7-day rule has plenty of slack)

(async () => {
  try {
    await connectDB();
    app.listen(env.port, () => {
      console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
    // Auto-promote 'new' lender/referrer applications to 'reviewing' after 7 days.
    promoteStalePartnerApplications();
    setInterval(promoteStalePartnerApplications, LIFECYCLE_INTERVAL_MS);
  } catch (err) {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  }
})();
