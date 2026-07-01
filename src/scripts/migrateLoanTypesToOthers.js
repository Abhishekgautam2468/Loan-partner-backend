// One-off migration: set loanType = 'Others' on EVERY application, in any status.
//
//   node src/scripts/migrateLoanTypesToOthers.js          # dry run — report only
//   node src/scripts/migrateLoanTypesToOthers.js --apply   # write changes
//
// WARNING: this is destructive and IRREVERSIBLE — the original loanType values are
// overwritten and cannot be recovered. Take a DB backup before running with --apply.
import mongoose from 'mongoose';
import env from '../config/env.js';
import Application from '../models/Application.js';

const APPLY = process.argv.includes('--apply');
const TARGET = 'Others';

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log(`[migrate] connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const total = await Application.estimatedDocumentCount();

  // Current distribution of loanType (so we can see exactly what's being overwritten).
  const breakdown = await Application.aggregate([
    { $group: { _id: '$loanType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`[migrate] ${total} application(s) total. Current loanType breakdown:`);
  for (const b of breakdown) console.log(`    ${String(b._id ?? '(none)').padEnd(32)} ${b.count}`);

  const toChange = await Application.countDocuments({ loanType: { $ne: TARGET } });
  console.log(`[migrate] ${toChange} document(s) would be set to "${TARGET}" (${total - toChange} already "${TARGET}").`);

  if (!APPLY) {
    console.log('[migrate] DRY RUN — no changes written. Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  const res = await Application.updateMany({ loanType: { $ne: TARGET } }, { $set: { loanType: TARGET } });
  console.log(`[migrate] DONE — modified ${res.modifiedCount} document(s).`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error('[migrate] FAILED:', e); process.exit(1); });
