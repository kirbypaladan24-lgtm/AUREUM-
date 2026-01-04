// utils.js
export function formatCurrency(amount) {
  return `₱${Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function sanitizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

export function validatePhone(phone) {
  const digits = sanitizePhone(phone);
  return /^\d{10,15}$/.test(digits);
}

export function validateBirthday(bday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bday)) return false;
  const dob = new Date(bday);
  if (Number.isNaN(dob.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 10 && age <= 120;
}

export function getCurrentDate() {
  const date = new Date();
  return date.toISOString().split('T')[0];
}
export function getCurrentTime() {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/* PIN hashing */
function hashPinSync(pin, salt) {
  const combined = pin + ':' + salt + ':pepper-v1';
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function hashPin(pin, salt) {
  if (window.crypto?.subtle) {
    const enc = new TextEncoder().encode(pin + ':' + salt + ':pepper-v1');
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return hashPinSync(pin, salt);
}

export function generateSalt() {
  return Math.random().toString(36).substring(2, 18);
}

export function generateCardNumberFromUsername(u) {
  let h = 0;
  for (let i = 0; i < u.length; i++) {
    h = ((h << 5) - h) + u.charCodeAt(i);
    h |= 0;
  }
  h = Math.abs(h);
  const base = ('' + h).padStart(12, '0').slice(-12);
  return `5200${base}`;
}
export function formatCardNumber(num) {
  return num.replace(/(.{4})/g, '$1 ').trim();
}