import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Treat unfilled placeholders like "<your-domain>" as empty so dev fallbacks work.
const clean = (v) => (v && !String(v).includes('<') ? v : '');
const P = (key, fallback = '') => clean(process.env[key]) || fallback;

const env = {
  port: P('PORT', 9040),
  nodeEnv: P('NODE_ENV', 'development'),
  mongoUri: P('MONGODB_URI', 'mongodb://127.0.0.1:27017/triopaisa_loan_dms'),
  jwtSecret: P('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: P('JWT_EXPIRES_IN', '45m'),
  clientOrigin: P('CLIENT_ORIGIN', 'http://localhost:5173'),
  contactEmail: P('CONTACT_EMAIL', 'Business@triopaisa.com'),
  smtp: {
    host: P('SMTP_HOST'),
    port: Number(P('SMTP_PORT', 587)),
    user: P('SMTP_USER'),
    pass: P('SMTP_PASS'),
    from: P('MAIL_FROM', 'TrioPaisa <no-reply@triopaisa.com>'),
  },
  cloudinary: {
    cloudName: P('CLOUDINARY_CLOUD_NAME'),
    apiKey: P('CLOUDINARY_API_KEY'),
    apiSecret: P('CLOUDINARY_API_SECRET'),
    folder: P('CLOUDINARY_FOLDER', 'triopaisa/documents'),
  },
  maxFileMb: Number(P('MAX_FILE_MB', 10)),
  seedAdmin: {
    name: P('SEED_ADMIN_NAME', 'Admin'),
    email: P('SEED_ADMIN_EMAIL', 'admin@triopaisa.com'),
    password: P('SEED_ADMIN_PASSWORD', 'Admin@12345'),
  },
};

export default env;
