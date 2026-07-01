// One-off: assign RMs to existing applications by alternating between the given
// names (so both RMs appear and the MIS / filter have data). Reversible — just
// sets the rmName field.
//
//   node src/scripts/assignRmToExisting.js          # dry run — report only
//   node src/scripts/assignRmToExisting.js --apply   # write changes
import mongoose from 'mongoose';
import env from '../config/env.js';
import Application from '../models/Application.js';

const APPLY = process.argv.includes('--apply');
const RMS = ['Kavya', 'Abhishek'];

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log(`[rm] connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const apps = await Application.find({}).sort({ createdAt: 1 }).select('_id fullName rmName');
  console.log(`[rm] ${apps.length} application(s).`);

  let i = 0, changed = 0;
  for (const a of apps) {
    const rm = RMS[i % RMS.length];
    i++;
    console.log(`    ${APPLY ? 'SET' : 'WOULD SET'}  ${a._id} (${a.fullName}) → ${rm}${a.rmName ? `  [was: ${a.rmName}]` : ''}`);
    if (APPLY) { a.rmName = rm; await a.save(); }
    changed++;
  }

  if (!APPLY) { console.log('[rm] DRY RUN — nothing written. Re-run with --apply.'); }
  else { console.log(`[rm] DONE — set RM on ${changed} application(s).`); }
  await mongoose.disconnect();
}

main().catch((e) => { console.error('[rm] FAILED:', e); process.exit(1); });
