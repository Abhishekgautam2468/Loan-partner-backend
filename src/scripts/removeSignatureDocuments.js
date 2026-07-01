// One-off cleanup: remove "Signature" document records from existing applications.
//
//   node src/scripts/removeSignatureDocuments.js          # dry run — report only
//   node src/scripts/removeSignatureDocuments.js --apply   # delete the records
//
// Signature was dropped from the KYC checklist; this clears any legacy records.
// Deletes the Document rows only (the stored Cloudinary asset is left in place, so
// this is reversible by re-inserting if ever needed). Idempotent.
import mongoose from 'mongoose';
import env from '../config/env.js';
import Document from '../models/Document.js';

const APPLY = process.argv.includes('--apply');
const MATCH = { category: /signature/i };

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log(`[sig] connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const docs = await Document.find(MATCH).select('_id applicationId category originalName');
  console.log(`[sig] ${docs.length} signature document(s) found.`);
  for (const d of docs) console.log(`    ${d._id}  app=${d.applicationId}  [${d.category}]  ${d.originalName}`);

  if (!APPLY) {
    console.log('[sig] DRY RUN — nothing deleted. Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  const res = await Document.deleteMany(MATCH);
  console.log(`[sig] DONE — deleted ${res.deletedCount} document(s).`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error('[sig] FAILED:', e); process.exit(1); });
