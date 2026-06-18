import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
    to: { type: String, required: true },
    type: { type: String, enum: ['status', 'manager-share', 'auth'], required: true },
    subject: { type: String },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    error: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('EmailLog', emailLogSchema);
