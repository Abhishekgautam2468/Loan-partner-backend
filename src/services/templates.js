import env from '../config/env.js';

// Minimal branded HTML email templates (TrioPaisa colors).
// A unique per-message marker is appended (hidden) so Gmail doesn't collapse the
// identical footer/wrapper across our transactional emails behind "show trimmed content".
const wrap = (title, body) => {
  const marker = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `<div style="font-family:Inter,Arial,sans-serif;background:#F8F9FA;padding:24px;color:#0F1115;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8EAED;border-radius:16px;overflow:hidden;">
      <div style="background:#0F1115;padding:20px 28px;color:#FFFFFF;font-weight:800;font-size:18px;"><img src="cid:tp-logo" alt="TrioPaisa" height="26" style="height:26px;width:auto;vertical-align:middle;border-radius:5px;margin-right:10px;" /><span style="vertical-align:middle;">TrioPaisa</span></div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 14px;font-size:20px;">${title}</h2>
        ${body}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #E8EAED;color:#8A8F98;font-size:12px;line-height:1.6;">
        Contact us: <a href="mailto:${env.contactEmail}" style="color:#3B87BF;text-decoration:none;">${env.contactEmail}</a> &nbsp;·&nbsp; <a href="${env.clientOrigin}" style="color:#3B87BF;text-decoration:none;">Visit TrioPaisa</a><br/>
        TrioPaisa is a loan facilitation platform. This is an automated message.
      </div>
    </div>
  </div><span style="display:none;font-size:0;line-height:0;max-height:0;mso-hide:all;">ref:${marker}</span>`;
};

export const statusEmail = (app, toStatus, remarks) => {
  const inr = (v) => `₹${Number(v).toLocaleString('en-IN')}`;
  const approvedAmt = ((toStatus === 'Approved' || toStatus === 'Disbursed') && app.approvedAmount) ? inr(app.approvedAmount) : null;
  const lines = {
    Submitted: 'We have received your loan application. Our team will begin the review shortly.',
    'Under Review': 'Your application is now under review by our credit team.',
    'Documents Verified': 'Your submitted documents have been verified.',
    'Forwarded to Lender': 'Your application has been forwarded to a lending partner.',
    Approved: `Congratulations! Your application has been approved${approvedAmt ? ` for ${approvedAmt}` : ''}.`,
    Disbursed: `Your approved loan${approvedAmt ? ` of ${approvedAmt}` : ''} has been disbursed.`,
    Rejected: `Unfortunately, your application was not approved.${remarks ? ` Reason: ${remarks}` : ''}`,
  };
  return {
    subject: `Your TrioPaisa application — ${toStatus}`,
    html: wrap(`Application ${toStatus}`, `
      <p style="font-size:15px;line-height:1.6;">Dear ${app.fullName},</p>
      <p style="font-size:15px;line-height:1.6;">${lines[toStatus] || 'Your application status has been updated.'}</p>
      <p style="font-size:14px;color:#6B7077;">Application ID: ${app._id}<br/>Loan type: ${app.loanType}<br/>${approvedAmt ? `Approved amount: <strong>${approvedAmt}</strong><br/>` : ''}Status: <strong>${toStatus}</strong></p>`),
  };
};

// Status-update email sent to a lender/referrer applicant on every pipeline change.
export const partnerStatusEmail = ({ name, role = 'partner', status }) => {
  const lines = {
    reviewing: 'Your application has moved into review by our partnerships team. We will be in touch as it progresses.',
    onboarded: `Congratulations! You have been onboarded as a TrioPaisa ${role}. Welcome aboard.`,
    declined: 'After careful review, we are unable to proceed with your application at this time. Thank you for your interest.',
    blocked: 'Your partner account has been placed on hold. Please contact our partnerships team for details.',
    new: 'We have received your application. Our partnerships team will review it shortly.',
  };
  const label = { reviewing: 'Under Review', onboarded: 'Onboarded', declined: 'Declined', blocked: 'On Hold', new: 'Received' }[status] || status;
  return {
    subject: `Your TrioPaisa partnership application — ${label}`,
    html: wrap(`Application ${label}`, `
      <p style="font-size:15px;line-height:1.6;">Dear ${name},</p>
      <p style="font-size:15px;line-height:1.6;">${lines[status] || 'Your application status has been updated.'}</p>
      <p style="font-size:14px;color:#6B7077;">Status: <strong>${label}</strong></p>`),
  };
};

export const passwordOtpEmail = (otp) => ({
  subject: `Your TrioPaisa verification code: ${otp}`,
  html: wrap('Your verification code', `
    <p style="font-size:15px;line-height:1.6;">Use the code below to set or reset your TrioPaisa password. It is valid for 15 minutes.</p>
    <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:34px;font-weight:800;letter-spacing:6px;color:#0F1115;background:#FFF6EE;border:1px solid #FBE3CC;border-radius:12px;padding:18px;text-align:center;margin:14px 0;">${otp}</div>
    <p style="font-size:13px;color:#8A8F98;">If you didn't request this, you can safely ignore this email.</p>`),
});

// Basic-info invite emailed to a lender when an application is shared. Carries NO
// applicant KYC and NO attachments — the lender views everything securely on the
// platform after verifying their email with a code.
export const lenderInviteEmail = (app, lender, link) => {
  const inr = (v) => (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) ? `₹${Number(v).toLocaleString('en-IN')}` : '';
  const amount = app.approvedAmount ? inr(app.approvedAmount) : inr(app.amountRequested);
  const body = `
    <p style="font-size:15px;line-height:1.6;">A loan application has been shared with you for review.</p>
    <table style="font-size:14px;color:#3A3F47;border-collapse:collapse;margin:6px 0 16px;">
      <tr><td style="padding:3px 14px 3px 0;color:#6B7077;">Applicant</td><td>${app.fullName}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#6B7077;">Product</td><td>${app.loanType}</td></tr>
      ${amount ? `<tr><td style="padding:3px 14px 3px 0;color:#6B7077;">Amount</td><td>${amount}</td></tr>` : ''}
      <tr><td style="padding:3px 14px 3px 0;color:#6B7077;">Reference</td><td>${app._id}</td></tr>
    </table>
    <div style="margin:6px 0 18px;">
      <a href="${link}" target="_blank" style="display:inline-block;background:#FA7D3B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px;">View securely on TrioPaisa</a>
      <div style="font-size:12px;color:#8A8F98;margin-top:8px;">or copy this link: <a href="${link}" style="color:#3B87BF;">${link}</a></div>
    </div>
    <p style="font-size:13px;color:#8A8F98;">For your security, you'll confirm your email with a one-time code before the full details and documents are shown. Nothing sensitive is included in this email.</p>`;
  return {
    subject: `Loan application shared for review — ${app.fullName}`,
    html: wrap('Loan Application — For Your Review', body),
  };
};

export const managerShareEmail = (app) => {
  const d = app.details || {};
  const p = d.personal || {};
  const emp = d.employmentType === 'Self-Employed' ? (d.selfEmployed || {}) : (d.salaried || {});
  const fin = d.financial || {};
  const inr = (v) => (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) ? `₹${Number(v).toLocaleString('en-IN')}` : (v || '');
  const addr = (x) => x ? [x.line1, x.line2, x.city, x.state, x.pincode].filter(Boolean).join(', ') : '';

  const row = (k, v) => (v === undefined || v === null || v === '' ? '' :
    `<tr><td style="padding:4px 14px 4px 0;color:#6B7077;white-space:nowrap;vertical-align:top;">${k}</td><td style="vertical-align:top;">${v}</td></tr>`);
  const section = (title, rows) => {
    const inner = rows.join('');
    return inner ? `<h3 style="font-size:14px;margin:18px 0 6px;color:#0F1115;">${title}</h3><table style="font-size:14px;color:#3A3F47;border-collapse:collapse;width:100%;">${inner}</table>` : '';
  };

  const refs = (d.references || []).filter((r) => r && r.name);

  const platformUrl = env.clientOrigin;
  const linkButton = platformUrl ? `
    <div style="margin:6px 0 18px;">
      <a href="${platformUrl}" target="_blank" style="display:inline-block;background:#FA7D3B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px;">View on the TrioPaisa platform</a>
      <div style="font-size:12px;color:#8A8F98;margin-top:8px;">or copy this link: <a href="${platformUrl}" style="color:#3B87BF;">${platformUrl}</a></div>
    </div>` : '';

  const body = `
    <p style="font-size:15px;line-height:1.6;">A loan application has been shared with you for review.</p>
    ${linkButton}
    ${section('Loan', [
      row('Type', app.loanType), row('Amount', inr(app.amountRequested)),
      row('Tenure', app.tenureMonths ? `${app.tenureMonths} months` : ''),
      row('Expected ROI', d.expectedRoi ? `${d.expectedRoi}% p.a.` : ''),
      row('External credit rating', d.externalCreditRating),
      row('Purpose', app.purpose),
    ])}
    ${section('Applicant', [
      row('Name', app.fullName), row("Father's / Husband's name", p.fatherOrHusbandName),
      row('Date of birth', p.dob), row('Gender', p.gender), row('Marital status', p.maritalStatus),
      row('Phone', app.phone), row('Alternate phone', p.alternatePhone), row('Email', app.email),
      row('Aadhaar', app.aadhaarNumber), row('PAN', app.panNumber),
    ])}
    ${section('Address', [
      row('Current', addr(d.currentAddress)),
      row('Permanent', d.sameAsCurrent === false ? addr(d.permanentAddress) : (addr(d.currentAddress) ? 'Same as current' : '')),
    ])}
    ${section(`Employment${d.employmentType ? ` — ${d.employmentType}` : ''}`, d.employmentType === 'Self-Employed' ? [
      row('Business name', emp.businessName), row('Business type', emp.businessType), row('GST number', emp.gstNumber),
      row('Annual turnover', inr(emp.annualTurnover)), row('Monthly income', inr(emp.monthlyIncome)), row('Business address', emp.businessAddress),
    ] : [
      row('Company', emp.companyName), row('Designation', emp.designation), row('Experience', emp.experience ? `${emp.experience} yrs` : ''),
      row('Monthly salary', inr(emp.monthlySalary)), row('Salary bank', emp.salaryBank), row('Office address', emp.officeAddress),
    ])}
    ${section('Financial', [
      row('Existing EMI', inr(fin.existingEmi)), row('Existing loans', fin.existingLoans),
      row('Credit card outstanding', inr(fin.creditCardOutstanding)), row('Monthly expenses', inr(fin.monthlyExpenses)),
      row('Bank', fin.bankName), row('Account number', fin.accountNumber), row('IFSC', fin.ifsc),
    ])}
    ${section('References', refs.map((r, i) => row(`Reference ${i + 1}`, [r.name, r.relationship, r.phone].filter(Boolean).join(' · '))))}
    <p style="font-size:13px;color:#8A8F98;margin-top:18px;">Application ID: ${app._id}<br/>Verified documents are attached to this email.</p>`;

  return {
    subject: `Loan application forwarded — ${app.fullName} (${app._id})`,
    html: wrap('Loan Application — For Your Review', body),
  };
};
