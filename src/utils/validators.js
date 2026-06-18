export const AADHAAR_RE = /^\d{12}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const isAadhaar = (v) => AADHAAR_RE.test(String(v || '').trim());
export const isPan = (v) => PAN_RE.test(String(v || '').trim().toUpperCase());

// Mask for list views: show last 4 of Aadhaar, first 5 of PAN.
export const maskAadhaar = (v) =>
  v ? `XXXX XXXX ${String(v).slice(-4)}` : '';
export const maskPan = (v) =>
  v ? `${String(v).slice(0, 5)}XXXXX` : '';
