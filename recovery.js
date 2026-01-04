import {
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  doc
} from "./firebase-config.js";
import { usersCol } from "./constants.js";
import { showMessage } from "./toast.js";
import { hashPin, generateSalt } from "./utils.js";
import { getPinValue } from "./keypad.js";
import { showPage } from "./navigation.js";

let recoveryAccount = null;

function getQuestionText(key) {
  const questions = {
    'mother': "What is your mother's maiden name?",
    'pet': "What was the name of your first pet?",
    'city': "What city were you born in?"
  };
  return questions[key] || "Security Question";
}

async function fetchUserByUsername(username) {
  const q = query(usersCol, where('username', '==', username), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ref: d.ref, ...d.data() };
}

export async function startPinRecovery() {
  const username = document.getElementById('recoveryUsername').value.trim();

  if (!username) {
    showMessage('pinRecoveryMessage', 'Please enter your username.', 'error');
    return;
  }
  try {
    const account = await fetchUserByUsername(username);
    if (!account || !account.security_question || !account.security_answer) {
      showMessage('pinRecoveryMessage', 'Account not found or security details missing.', 'error');
      return;
    }
    recoveryAccount = account;
    const step1 = document.getElementById('recoveryStep1');
    const step2 = document.getElementById('recoveryStep2');
    const securityQ = document.getElementById('securityQuestionDisplay');
    if (step1) step1.style.display = 'none';
    if (securityQ) securityQ.textContent = getQuestionText(account.security_question);
    if (step2) step2.style.display = 'block';
    showMessage('pinRecoveryMessage', 'Account found. Please answer your security question.', 'info');
  } catch (err) {
    console.error('Pin recovery error', err);
    showMessage('pinRecoveryMessage','Failed to find account','error');
  }
}

export function verifyPinAnswer() {
  if (!recoveryAccount) return;
  const answer = document.getElementById('securityAnswerInput').value.trim();
  if (answer.toLowerCase() === recoveryAccount.security_answer.toLowerCase()) {
    const step2 = document.getElementById('recoveryStep2');
    const step3 = document.getElementById('recoveryStep3');
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'block';
    const msg = document.getElementById('pinRecoveryMessage'); if (msg) msg.innerHTML = '';
  } else {
    showMessage('pinRecoveryMessage', 'Incorrect security answer.', 'error');
  }
}

export async function setNewPin() {
  if (!recoveryAccount) return;

  const newPin = getPinValue('recoveryNewPin');
  const confirmPin = getPinValue('recoveryConfirmPin');

  if (!newPin || !confirmPin) {
    showMessage('pinRecoveryMessage', 'Please enter and confirm the new PIN.', 'error');
    return;
  }

  if (newPin !== confirmPin) {
    showMessage('pinRecoveryMessage', 'New PINs do not match.', 'error');
    return;
  }

  if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
    showMessage('pinRecoveryMessage', 'PIN must be 4-6 digits', 'error');
    return;
  }

  try {
    const newSalt = generateSalt();
    const newHash = await hashPin(newPin, newSalt);
    await updateDoc(doc(usersCol, recoveryAccount.id), { pin_hash: newHash, pin_salt: newSalt });

    recoveryAccount = null;
    showMessage('pinRecoveryMessage', 'PIN reset successful! You can now login with your new PIN.', 'success');
    setTimeout(() => showPage('loginPage'), 2000);
  } catch (err) {
    console.error('Set new PIN failed', err);
    showMessage('pinRecoveryMessage', 'Failed to reset PIN.', 'error');
  }
}