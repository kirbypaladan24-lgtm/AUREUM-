// otp.js
import { state } from "./state.js";
import { showToast } from "./toast.js";

export function requireOtp(amount, proceed) {
  if (amount <= 5000) { // OTP_HIGH_VALUE is 5000
    proceed();
    return;
  }
  const code = String(Math.floor(100000 + Math.random()*900000));
  state.pendingOtp = code;
  state.pendingOtpCallback = proceed;
  const otpInputEl = document.getElementById('otpInput');
  if (otpInputEl) otpInputEl.value = '';
  const otpSentInfoEl = document.getElementById('otpSentInfo');
  if (otpSentInfoEl) otpSentInfoEl.textContent = `OTP sent to your registered contact (dev preview: ${code})`;
  const overlay = document.getElementById('otpModalOverlay');
  if (overlay) overlay.style.display = 'flex';
}
export function setupOtpButtons() {
  const otpCancelBtn = document.getElementById('otpCancelBtn');
  if (otpCancelBtn) otpCancelBtn.onclick = () => {
    state.pendingOtp=null; state.pendingOtpCallback=null;
    const o=document.getElementById('otpModalOverlay'); if(o) o.style.display='none';
  };
  const otpVerifyBtn = document.getElementById('otpVerifyBtn');
  if (otpVerifyBtn) otpVerifyBtn.onclick = () => {
    const valEl = document.getElementById('otpInput');
    const val = valEl ? valEl.value.trim() : '';
    if (val === state.pendingOtp && state.pendingOtpCallback) {
      const overlay = document.getElementById('otpModalOverlay');
      if (overlay) overlay.style.display = 'none';
      const cb = state.pendingOtpCallback;
      state.pendingOtp = null; state.pendingOtpCallback = null;
      cb();
    } else {
      showToast('Invalid OTP','Please check the code and try again','error');
    }
  };
}
export function guardHighValue(amount, doAction) {
  requireOtp(amount, doAction);
}