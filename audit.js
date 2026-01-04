// audit.js
import { addDoc } from "./firebase-config.js";
import { auditCol } from "./constants.js";
import { state } from "./state.js";

export async function logAuditEvent(event) {
  try {
    await addDoc(auditCol, {
      timestamp: new Date().toISOString(),
      userId: state.currentUser?.id || 'anonymous',
      username: state.currentUser?.username || 'anonymous',
      action: event.action,
      details: event.details,
      ipAddress: 'client-side',
      userAgent: navigator.userAgent
    });
  } catch (err) {
    console.error('Audit log failed', err);
  }
}

export async function logProfileChange(action, before, after) {
  try {
    await addDoc(auditCol, {
      timestamp: new Date().toISOString(),
      userId: state.currentUser?.id || 'anonymous',
      username: state.currentUser?.username || 'anonymous',
      action,
      details: { before, after },
      ipAddress: 'client-side',
      userAgent: navigator.userAgent
    });
  } catch (e) {
    console.warn('Profile change audit failed', e);
  }
}