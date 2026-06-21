// End-to-end smoke test against an in-memory MongoDB (no real DB needed).
// Run: node src/scripts/smoke.js
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('triopaisa_smoke');
process.env.JWT_SECRET = 'smoke-secret';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SEED_ADMIN_EMAIL = 'admin@triopaisa.com';
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';
process.env.PORT = '5099';

const { connectDB } = await import('../config/db.js');
const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { ROLES } = await import('../utils/constants.js');

await connectDB();

// seed admin
const admin = new User({ name: 'Admin', email: 'admin@triopaisa.com', role: ROLES.ADMIN });
await admin.setPassword('Admin@12345');
await admin.save();

const server = app.listen(5099);
const base = 'http://localhost:5099/api';
let pass = 0, fail = 0;
const j = (r) => r.json();
async function step(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} — ${e.message}`); fail++; }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

let custToken, adminToken, appId, onboardedLenderId, docless;
let setupToken, setupEmail;

await step('GET /health', async () => {
  const r = await fetch(`${base}/health`); const d = await j(r);
  expect(r.status === 200 && d.ok, 'health not ok');
});

await step('GET /meta returns the loan types', async () => {
  const d = await j(await fetch(`${base}/meta`));
  expect(d.loanTypes.length >= 7 && d.loanTypes.includes('Personal Loan'), `got ${d.loanTypes.length}`);
});

await step('register customer', async () => {
  const r = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Asha', email: 'asha@example.com', phone: '9999999999', password: 'Password1' }) });
  const d = await j(r); expect(r.status === 201 && d.token, 'no token'); custToken = d.token;
});

await step('reject bad Aadhaar/PAN on apply', async () => {
  const fd = new FormData();
  Object.entries({ fullName: 'Asha', phone: '9999999999', email: 'asha@example.com', aadhaarNumber: '123', panNumber: 'BAD', loanType: 'Personal Loan', amountRequested: '100000' }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/applications`, { method: 'POST', headers: { Authorization: `Bearer ${custToken}` }, body: fd });
  expect(r.status === 422, `expected 422 got ${r.status}`);
});

await step('create application (valid)', async () => {
  const fd = new FormData();
  Object.entries({ fullName: 'Asha Rao', phone: '9999999999', email: 'asha@example.com', aadhaarNumber: '123456789012', panNumber: 'ABCDE1234F', loanType: 'Personal Loan', amountRequested: '500000', purpose: 'Test' }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/applications`, { method: 'POST', headers: { Authorization: `Bearer ${custToken}` }, body: fd });
  const d = await j(r); expect(r.status === 201 && d.application, `status ${r.status}`); appId = d.application._id;
});

await step('public application (no login)', async () => {
  const fd = new FormData();
  const fields = { fullName: 'Walk In', phone: '8888888888', email: 'walkin@example.com', aadhaarNumber: '210987654321', panNumber: 'ZYXWV9876K', loanType: 'Home Loan', amountRequested: '2500000', tenureMonths: '120', details: JSON.stringify({ employmentType: 'Salaried', financial: { bankName: 'HDFC' } }) };
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/public/applications`, { method: 'POST', body: fd });
  const d = await j(r);
  expect(r.status === 201 && d.application?._id, `status ${r.status}`);
  expect(d.account && d.account.exists === false && d.account.setupToken, 'no setup token for new account');
  setupToken = d.account.setupToken; setupEmail = d.account.email;
});

await step('set password via setup token → returns JWT', async () => {
  const r = await fetch(`${base}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: setupEmail, token: setupToken, password: 'WalkIn@123' }) });
  const d = await j(r); expect(r.status === 200 && d.token && d.user, `status ${r.status}`);
});

await step('login with the new password', async () => {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: setupEmail, password: 'WalkIn@123' }) });
  const d = await j(r); expect(r.status === 200 && d.token, `status ${r.status}`);
});

await step('walk-in account sees its linked application', async () => {
  const login = await j(await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: setupEmail, password: 'WalkIn@123' }) }));
  const d = await j(await fetch(`${base}/applications/mine`, { headers: { Authorization: `Bearer ${login.token}` } }));
  expect(d.applications.length === 1 && d.applications[0].loanType === 'Home Loan', `linked ${d.applications.length}`);
});

await step('forgot-password responds 200 (OTP emailed)', async () => {
  const r = await fetch(`${base}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: setupEmail }) });
  expect(r.status === 200, `status ${r.status}`);
});

await step('public lender application (no login)', async () => {
  const r = await fetch(`${base}/public/lender-applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institutionName: 'Acme NBFC', institutionType: 'NBFC', contactName: 'Riya', email: 'riya@acme.com', phone: '7777777777', products: ['Personal Loan', 'Business Loan'] }),
  });
  const d = await j(r); expect(r.status === 201 && d.application?._id, `status ${r.status}`);
});

await step('customer sees own application', async () => {
  const d = await j(await fetch(`${base}/applications/mine`, { headers: { Authorization: `Bearer ${custToken}` } }));
  expect(d.applications.length === 1, 'expected 1 app');
});

await step('customer cannot reach admin route', async () => {
  const r = await fetch(`${base}/admin/applications`, { headers: { Authorization: `Bearer ${custToken}` } });
  expect(r.status === 403, `expected 403 got ${r.status}`);
});

await step('admin login', async () => {
  const r = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@triopaisa.com', password: 'Admin@12345' }) });
  const d = await j(r); expect(r.status === 200 && d.token, 'no admin token'); adminToken = d.token;
});

const A = () => ({ Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' });

await step('admin search by name', async () => {
  const d = await j(await fetch(`${base}/admin/applications?q=Asha`, { headers: A() }));
  expect(d.applications.length === 1, 'search failed');
});

await step('admin lists, opens & updates lender application', async () => {
  const list = await j(await fetch(`${base}/admin/lender-applications`, { headers: A() }));
  expect(list.lenders.length >= 1, 'no lender applications');
  const lid = list.lenders[0]._id;
  const detail = await j(await fetch(`${base}/admin/lender-applications/${lid}`, { headers: A() }));
  expect(detail.lender && detail.lender.institutionName, 'lender detail missing');
  // Pipeline is rigid: new → reviewing → onboarded.
  await fetch(`${base}/admin/lender-applications/${lid}`, { method: 'PATCH', headers: A(), body: JSON.stringify({ status: 'reviewing' }) });
  const upd = await fetch(`${base}/admin/lender-applications/${lid}`, { method: 'PATCH', headers: A(), body: JSON.stringify({ status: 'onboarded' }) });
  const ud = await j(upd); expect(upd.status === 200 && ud.lender.status === 'onboarded', `update failed (${upd.status})`);
  onboardedLenderId = lid;
});

await step('public referrer application (no login)', async () => {
  const r = await fetch(`${base}/public/referrer-applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Rohit Mehta', referrerType: 'DSA', email: 'rohit@dsa.com', phone: '6666666666', products: ['Personal Loan'] }),
  });
  const d = await j(r); expect(r.status === 201 && d.application?._id, `status ${r.status}`);
});

await step('admin lists, opens, updates & deletes referrer', async () => {
  const list = await j(await fetch(`${base}/admin/referrer-applications`, { headers: A() }));
  expect(list.referrers.length >= 1, 'no referrer applications');
  const rid = list.referrers[0]._id;
  const detail = await j(await fetch(`${base}/admin/referrer-applications/${rid}`, { headers: A() }));
  expect(detail.referrer && detail.referrer.fullName, 'referrer detail missing');
  // Pipeline is rigid: new → reviewing → onboarded.
  await fetch(`${base}/admin/referrer-applications/${rid}`, { method: 'PATCH', headers: A(), body: JSON.stringify({ status: 'reviewing' }) });
  const upd = await fetch(`${base}/admin/referrer-applications/${rid}`, { method: 'PATCH', headers: A(), body: JSON.stringify({ status: 'onboarded' }) });
  const ud = await j(upd); expect(upd.status === 200 && ud.referrer.status === 'onboarded', `update failed (${upd.status})`);
  const created = await j(await fetch(`${base}/admin/referrer-applications`, { method: 'POST', headers: A(), body: JSON.stringify({ fullName: 'Manual DSA', referrerType: 'Consultant', email: 'm@dsa.com', phone: '5555555555' }) }));
  expect(created.referrer?._id, 'admin create referrer failed');
  const del = await fetch(`${base}/admin/referrer-applications/${created.referrer._id}`, { method: 'DELETE', headers: A() });
  expect(del.status === 200, `delete failed (${del.status})`);
});

await step('illegal transition blocked (Submitted→Approved)', async () => {
  const r = await fetch(`${base}/admin/applications/${appId}/status`, { method: 'PATCH', headers: A(), body: JSON.stringify({ toStatus: 'Approved' }) });
  expect(r.status === 400, `expected 400 got ${r.status}`);
});

for (const s of ['Under Review', 'Documents Verified', 'Approved']) {
  await step(`transition → ${s}`, async () => {
    const r = await fetch(`${base}/admin/applications/${appId}/status`, { method: 'PATCH', headers: A(), body: JSON.stringify({ toStatus: s }) });
    expect(r.status === 200, `status ${r.status}`);
  });
}

await step('share approved app to onboarded lender (email dev-logged)', async () => {
  const r = await fetch(`${base}/admin/applications/${appId}/share-to-lender`, { method: 'POST', headers: A(), body: JSON.stringify({ lenderId: onboardedLenderId }) });
  const d = await j(r); expect(r.status === 200 && d.application.assignedLenderId, `status ${r.status}`);
});

await step('stats reflect 1 approved', async () => {
  const d = await j(await fetch(`${base}/admin/stats`, { headers: A() }));
  expect(d.counts.approved === 1 && d.counts.assigned === 1, JSON.stringify(d.counts));
});

await step('re-apply (decided category) with reuseDocumentsFrom', async () => {
  // appId is now Approved, so re-applying the same category is allowed.
  const fd = new FormData();
  Object.entries({ fullName: 'Asha Rao', phone: '9999999999', email: 'asha@example.com', aadhaarNumber: '123456789012', panNumber: 'ABCDE1234F', loanType: 'Personal Loan', amountRequested: '600000', purpose: 'Re-apply', reuseDocumentsFrom: appId }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/applications`, { method: 'POST', headers: { Authorization: `Bearer ${custToken}` }, body: fd });
  const d = await j(r); expect(r.status === 201 && d.application._id !== appId, `status ${r.status}`);
});

await step('duplicate pending category blocked (409)', async () => {
  // The re-applied Personal Loan is now pending → another must be blocked.
  const fd = new FormData();
  Object.entries({ fullName: 'Asha Rao', phone: '9999999999', email: 'asha@example.com', aadhaarNumber: '123456789012', panNumber: 'ABCDE1234F', loanType: 'Personal Loan', amountRequested: '700000' }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/applications`, { method: 'POST', headers: { Authorization: `Bearer ${custToken}` }, body: fd });
  expect(r.status === 409, `expected 409 got ${r.status}`);
});

await step('SCF: /meta excludes SCF products', async () => {
  const d = await j(await fetch(`${base}/meta`));
  expect(!d.loanTypes.includes('Dealer Finance'), 'meta should not expose SCF products');
});

await step('SCF: public submit creates application + account', async () => {
  const fd = new FormData();
  const details = JSON.stringify({
    scf: true,
    business: { companyName: 'Trade Co', gstNumber: '27ABCDE1234F1Z5', industry: 'Auto' },
    funding: { amountRequested: '2500000', tenureMonths: '3' },
    productDetails: { anchorBrand: 'BrandX', requiredFunding: '2500000' },
  });
  Object.entries({ fullName: 'SCF Owner', phone: '9090909090', email: 'scfco@example.com', aadhaarNumber: '111122223333', panNumber: 'PQRST5678U', loanType: 'Dealer Finance', amountRequested: '2500000', tenureMonths: '3', details }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/public/applications`, { method: 'POST', body: fd });
  const d = await j(r);
  expect(r.status === 201 && d.application?._id, `status ${r.status}`);
  expect(d.account?.setupToken, 'no setup token');
});

await step('SCF: admin sees the SCF application with scf details', async () => {
  const list = await j(await fetch(`${base}/admin/applications?q=SCF Owner`, { headers: A() }));
  expect(list.applications.length === 1 && list.applications[0].loanType === 'Dealer Finance', `found ${list.applications.length}`);
  const detail = await j(await fetch(`${base}/admin/applications/${list.applications[0]._id}`, { headers: A() }));
  expect(detail.application?.details?.scf === true, 'scf flag missing on detail');
});

await step('PAN uniqueness: different email + in-use PAN blocked (409)', async () => {
  // ABCDE1234F is already bound to asha's account; a different email must be rejected.
  const fd = new FormData();
  Object.entries({ fullName: 'Intruder', phone: '9000000000', email: 'intruder@example.com', aadhaarNumber: '444455556666', panNumber: 'ABCDE1234F', loanType: 'Gold Loan', amountRequested: '100000' }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`${base}/public/applications`, { method: 'POST', body: fd });
  expect(r.status === 409, `expected 409 got ${r.status}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
await mongod.stop();
process.exit(fail ? 1 : 0);
