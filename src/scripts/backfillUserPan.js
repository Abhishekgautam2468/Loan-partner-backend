// One-off migration: populate User.panNumber for accounts that don't have it,
// using the PAN from an application the account owns. Idempotent and safe to re-run.
//
//   node src/scripts/backfillUserPan.js          # dry run — report only
//   node src/scripts/backfillUserPan.js --apply   # write changes
//
// Why this is needed: older accounts were created before the PAN was bound to the
// account at submit time, so their panNumber is empty. That breaks the "one PAN =
// one account" lookups (e.g. the apply-form precheck that redirects returning
// applicants to login). New submissions set panNumber correctly; this fixes history.
import mongoose from 'mongoose';
import env from '../config/env.js';
import Application from '../models/Application.js';
import User from '../models/User.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log(`[backfill] connected — ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const users = await User.find({ $or: [{ panNumber: { $exists: false } }, { panNumber: null }] });
  let filled = 0, conflicts = 0, noSource = 0;

  for (const u of users) {
    // Newest application this account owns that carries a PAN.
    const app = await Application.findOne({ customerId: u._id, panNumber: { $ne: null } })
      .select('panNumber').sort({ createdAt: -1 });
    if (!app) { noSource++; continue; }

    const pan = String(app.panNumber).toUpperCase().trim();
    const clash = await User.findOne({ _id: { $ne: u._id }, panNumber: pan }).select('email');
    if (clash) {
      console.log(`  CONFLICT  ${u.email}: PAN ${pan} already on ${clash.email} — skipped`);
      conflicts++;
      continue;
    }

    console.log(`  ${APPLY ? 'SET' : 'WOULD SET'}  ${u.email} → ${pan}`);
    if (APPLY) {
      try { u.panNumber = pan; await u.save(); filled++; }
      catch (e) { console.log(`  FAILED    ${u.email}: ${e.code || ''} ${e.message}`); }
    } else { filled++; }
  }

  console.log(`[backfill] ${APPLY ? 'filled' : 'would fill'}=${filled}, conflicts=${conflicts}, noSource=${noSource}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
