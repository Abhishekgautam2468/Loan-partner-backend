import ActivityLog from '../models/ActivityLog.js';

// Fire-and-log; never block the main flow on a logging failure.
export async function logActivity({ actorUserId, action, targetType, targetId, meta }) {
  try {
    await ActivityLog.create({ actorUserId, action, targetType, targetId, meta });
  } catch (err) {
    console.error('[activity] failed to log', action, err.message);
  }
}
