import { validationResult } from 'express-validator';
import { ApiError } from '../utils/asyncHandler.js';

// Runs after express-validator chains; throws 422 with field details.
export function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const err = new ApiError(422, 'Validation failed');
  err.details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(err);
}
