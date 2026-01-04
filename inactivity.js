// inactivity.js
import { state } from "./state.js";
import { INACTIVITY_LIMIT_MS } from "./constants.js";
import { logout } from "./auth.js";

export function resetInactivityTimer() {
  clearInactivityTimer();
  state.inactivityTimer = setTimeout(() => {
    alert('Session timed out due to inactivity. You have been logged out.');
    logout();
  }, INACTIVITY_LIMIT_MS);
}

export function clearInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    state.inactivityTimer = null;
  }
}

export function attachInactivityListeners() {
  ['click','keydown','mousemove','touchstart'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
}