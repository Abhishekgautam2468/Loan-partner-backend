import LenderApplication from '../models/LenderApplication.js';
import ReferrerApplication from '../models/ReferrerApplication.js';
import { sendMail } from './email.service.js';
import { partnerStatusEmail } from './templates.js';
import { logActivity } from './activity.service.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Promote 'new' applications older than 7 days to 'reviewing', notify the applicant,
// and log the change. They then stay in 'reviewing' until an admin onboards/declines.
async function promote(Model, { kind, nameOf }) {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const stale = await Model.find({ status: 'new', createdAt: { $lte: cutoff } });
  for (const doc of stale) {
    doc.status = 'reviewing';
    await doc.save();
    await logActivity({ actorUserId: null, action: `${kind}.status`, targetType: Model.modelName, targetId: doc._id, meta: { status: 'reviewing', auto: true } });
    const { subject, html } = partnerStatusEmail({ name: nameOf(doc) || 'Partner', role: kind, status: 'reviewing' });
    await sendMail({ to: doc.email, subject, html, type: kind });
  }
  return stale.length;
}

export async function promoteStalePartnerApplications() {
  try {
    const lenders = await promote(LenderApplication, { kind: 'lender', nameOf: (d) => d.contactName || d.institutionName });
    const referrers = await promote(ReferrerApplication, { kind: 'referrer', nameOf: (d) => d.fullName });
    if (lenders || referrers) {
      console.log(`[lifecycle] promoted ${lenders} lender(s) + ${referrers} referrer(s) new→reviewing (7-day rule)`);
    }
  } catch (err) {
    console.error('[lifecycle] promotion failed', err.message);
  }
}
