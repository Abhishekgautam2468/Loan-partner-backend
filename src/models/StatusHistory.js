import mongoose from 'mongoose';
import { STATUS_LIST } from '../utils/constants.js';

const statusHistorySchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    fromStatus: { type: String, enum: [...STATUS_LIST, null], default: null },
    toStatus: { type: String, enum: STATUS_LIST, required: true },
    changedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null = system
    remarks: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('StatusHistory', statusHistorySchema);
