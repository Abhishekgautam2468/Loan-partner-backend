// Minimal branded HTML email templates (TrioPaisa colors).
const wrap = (title, body) => `
  <div style="font-family:Inter,Arial,sans-serif;background:#F8F9FA;padding:24px;color:#0F1115;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8EAED;border-radius:16px;overflow:hidden;">
      <div style="background:#0F1115;padding:20px 28px;color:#FFFFFF;font-weight:800;font-size:18px;">TrioPaisa</div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 14px;font-size:20px;">${title}</h2>
        ${body}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #E8EAED;color:#8A8F98;font-size:12px;">
        TrioPaisa is a loan facilitation platform. This is an automated message.
      </div>
    </div>
  </div>`;

export const statusEmail = (app, toStatus, remarks) => {
  const lines = {
    Submitted: 'We have received your loan application. Our team will begin the review shortly.',
    'Under Review': 'Your application is now under review by our credit team.',
    'Documents Verified': 'Your submitted documents have been verified.',
    'Forwarded to Lender': 'Your application has been forwarded to a lending partner.',
    Approved: 'Congratulations! Your application has been approved.',
    Rejected: `Unfortunately, your application was not approved.${remarks ? ` Reason: ${remarks}` : ''}`,
  };
  return {
    subject: `Your TrioPaisa application — ${toStatus}`,
    html: wrap(`Application ${toStatus}`, `
      <p style="font-size:15px;line-height:1.6;">Dear ${app.fullName},</p>
      <p style="font-size:15px;line-height:1.6;">${lines[toStatus] || 'Your application status has been updated.'}</p>
      <p style="font-size:14px;color:#6B7077;">Application ID: ${app._id}<br/>Loan type: ${app.loanType}<br/>Status: <strong>${toStatus}</strong></p>`),
  };
};

export const managerShareEmail = (app) => ({
  subject: `Approved loan application forwarded — ${app.fullName} (${app._id})`,
  html: wrap('Approved Application — For Your Review', `
    <p style="font-size:15px;line-height:1.6;">An approved loan application has been shared with you.</p>
    <table style="font-size:14px;color:#3A3F47;border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Applicant</td><td>${app.fullName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Phone</td><td>${app.phone}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Email</td><td>${app.email}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Aadhaar</td><td>${app.aadhaarNumber}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">PAN</td><td>${app.panNumber}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Loan type</td><td>${app.loanType}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Amount</td><td>₹${app.amountRequested}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6B7077;">Application ID</td><td>${app._id}</td></tr>
    </table>
    <p style="font-size:13px;color:#8A8F98;margin-top:16px;">All uploaded documents are attached to this email.</p>`),
});
