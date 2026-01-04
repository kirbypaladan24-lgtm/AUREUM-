// keypad.js
import { state } from "./state.js";
import { resetInactivityTimer } from "./inactivity.js";

export function ensureVirtualKeypad() {
  let kp = document.getElementById('virtualKeypadContainer');
  if (kp) return kp;
  kp = document.createElement('div');
  kp.id = 'virtualKeypadContainer';
  kp.className = 'virtual-keypad-container';
  const grid = document.createElement('div');
  grid.className = 'virtual-keypad';
  const addBtn = (label, className, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };
  ['1','2','3','4','5','6','7','8','9','0'].forEach(num => {
    grid.appendChild(addBtn(num, 'keypad-btn', () => keypadInput(num)));
  });
  grid.appendChild(addBtn('⌫', 'keypad-action-btn delete', keypadDelete));
  grid.appendChild(addBtn('Close', 'keypad-action-btn', hideKeypad));
  kp.appendChild(grid);
  document.body.appendChild(kp);
  return kp;
}

export function showKeypad(targetId, minLength, maxLength) {
  ensureVirtualKeypad();
  document.activeElement.blur();
  state.currentKeypadTargetId = targetId;
  state.pinMinLength = minLength;
  state.pinMaxLength = maxLength;
  const kp = document.getElementById('virtualKeypadContainer');
  if (kp) kp.style.display = 'block';
  const targetEl = document.getElementById(targetId);
  if(targetEl) {
    targetEl.focus();
    const actualValue = targetEl.getAttribute('data-pin-value') || '';
    const isVisible = targetEl.getAttribute('data-visible') === 'true';
    targetEl.value = isVisible ? actualValue : '•'.repeat(actualValue.length);
  }
}
export function hideKeypad() {
  const kp = document.getElementById('virtualKeypadContainer');
  if (kp) kp.style.display = 'none';
  state.currentKeypadTargetId = null;
}
export function keypadInput(key) {
  if (!state.currentKeypadTargetId) return;
  const targetEl = document.getElementById(state.currentKeypadTargetId);
  if (!targetEl) return;
  let actualValue = targetEl.getAttribute('data-pin-value') || '';
  if (actualValue.length < state.pinMaxLength) {
    actualValue += key;
    targetEl.setAttribute('data-pin-value', actualValue);
    const isVisible = targetEl.getAttribute('data-visible') === 'true';
    targetEl.value = isVisible ? actualValue : '•'.repeat(actualValue.length);
  }
  resetInactivityTimer();
}
export function keypadDelete() {
  if (!state.currentKeypadTargetId) return;
  const targetEl = document.getElementById(state.currentKeypadTargetId);
  if (!targetEl) return;
  let actualValue = targetEl.getAttribute('data-pin-value') || '';
  if (actualValue.length > 0) {
    actualValue = actualValue.slice(0, -1);
    targetEl.setAttribute('data-pin-value', actualValue);
    const isVisible = targetEl.getAttribute('data-visible') === 'true';
    targetEl.value = isVisible ? actualValue : '•'.repeat(actualValue.length);
  }
  resetInactivityTimer();
}
export function getPinValue(id) {
  const el = document.getElementById(id);
  return el ? el.getAttribute('data-pin-value') || '' : '';
}
export function togglePinVisibility(input, button) {
  const isVisible = input.getAttribute('data-visible') === 'true';
  const actualValue = input.getAttribute('data-pin-value') || '';
  if (isVisible) {
    input.setAttribute('data-visible', 'false');
    input.value = '•'.repeat(actualValue.length);
    button.innerHTML = '◉';
    button.setAttribute('aria-label', 'Show PIN');
  } else {
    input.setAttribute('data-visible', 'true');
    input.value = actualValue;
    button.innerHTML = '—';
    button.setAttribute('aria-label', 'Hide PIN');
  }
}
export function initPinEyeToggles() {
  const pinInputs = document.querySelectorAll('.pin-input');
  pinInputs.forEach(input => {
    const parent = input.parentElement;
    if (!parent) return;
    parent.classList.add('pin-eye-group');
    input.setAttribute('data-visible', 'false');
    if (parent.querySelector('.pin-eye-toggle')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin-eye-toggle';
    btn.innerHTML = '◉';
    btn.setAttribute('aria-label', 'Show PIN');
    btn.addEventListener('click', () => togglePinVisibility(input, btn));
    parent.appendChild(btn);
  });
}

export function securePinInputs() {
  const pinInputs = document.querySelectorAll('.pin-input');
  pinInputs.forEach(input => {
    input.addEventListener('copy', e => e.preventDefault());
    input.addEventListener('cut', e => e.preventDefault());
    input.addEventListener('paste', e => e.preventDefault());
    input.addEventListener('contextmenu', e => e.preventDefault());
    input.addEventListener('blur', () => {
      input.value = '•'.repeat((input.getAttribute('data-pin-value') || '').length);
    });
  });
}