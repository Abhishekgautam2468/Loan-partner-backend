import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export const signToken = (payload, opts = {}) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn, ...opts });

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);
