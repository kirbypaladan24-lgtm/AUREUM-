// goals.js
import {
  addDoc,
  getDocs,
  collection,
  doc,
  runTransaction,
  increment,
  serverTimestamp
} from "./firebase-config.js";
import { state } from "./state.js";
import { showMessage, showToast } from "./toast.js";
import { formatCurrency, getCurrentDate, getCurrentTime } from "./utils.js";
import { transactionsCol } from "./constants.js";
import { updateBalance } from "./navigation.js";
import { evaluateAchievements } from "./achievements.js";

export function addGoal() {
  if (!state.currentUser) return;
  const name = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const date = document.getElementById('goalDate').value;
  if (!name || !target || target <= 0) {
    showMessage('goalsMessage', 'Enter goal name and valid target.', 'error');
    return;
  }
  addDoc(collection(db, 'users', state.currentUser.id, 'goals'), {
    owner: state.currentUser.username,
    ownerId: state.currentUser.id,
    name,
    target,
    saved: 0,
    targetDate: date || null,
    created: getCurrentDate()
  }).then(() => {
    showMessage('goalsMessage', 'Goal added!', 'success');
    showToast('Goal added', name, 'success');
    clearInputsInPage('goalsPage');
    renderGoals();
  }).catch(err => {
    console.error('Add goal failed', err);
    showMessage('goalsMessage','Failed to add goal','error');
  });
}

export async function renderGoals() {
  const list = document.getElementById('goalsList');
  if (!list) return;
  if (!state.currentUser) {
    list.innerHTML = '<div class="info-box">No goals yet.</div>';
    return;
  }
  const snap = await getDocs(collection(db, 'users', state.currentUser.id, 'goals'));
  const myGoals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (myGoals.length === 0) {
    list.innerHTML = '<div class="info-box">No goals yet.</div>';
    return;
  }
  list.innerHTML = myGoals.map(g => {
    const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
    const remaining = Math.max(0, g.target - g.saved);
    return `<div class="transaction-item">
<div class="transaction-header">${g.name}</div>
<div class="transaction-details">
Saved: ${formatCurrency(g.saved)} / ${formatCurrency(g.target)} (${pct}%)
${g.targetDate ? `<br>Target Date: ${g.targetDate}` : ''}
<div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
<div class="flex" style="margin-top:10px;">
<input type="number" min="0" step="0.01" placeholder="Add amount" id="goalAdd_${g.id}" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.06); color:#fff;">
<button style="flex:0 0 120px;" onclick="fundGoal('${g.id}')">Allocate</button>
</div>
<div class="tiny">Remaining: ${formatCurrency(remaining)}</div>
</div>
</div>`;
  }).join('');
}

export async function fundGoal(goalId) {
  if (!state.currentUser) return;
  const input = document.getElementById(`goalAdd_${goalId}`);
  if (!input) return;
  const amt = parseFloat(input.value);
  if (!amt || amt <= 0) return;
  try {
    await runTransaction(db, async (t) => {
      const uRef = doc(db, 'users', state.currentUser.id);
      const gRef = doc(collection(db, 'users', state.currentUser.id, 'goals'), goalId);
      const uSnap = await t.get(uRef);
      const gSnap = await t.get(gRef);
      if (!uSnap.exists() || !gSnap.exists()) throw new Error('Missing data');
      if ((uSnap.data().balance || 0) < amt) throw new Error('Insufficient balance to allocate.');
      t.update(uRef, { balance: increment(-amt) });
      t.update(gRef, { saved: increment(amt) });
      const txRef = doc(transactionsCol);
      t.set(txRef, {
        type: 'GOAL_FUND',
        username: state.currentUser.username,
        userId: state.currentUser.id,
        amount: amt,
        goalId,
        date: getCurrentDate(),
        time: getCurrentTime(),
        createdAt: serverTimestamp()
      });
    });
    updateBalance();
    renderGoals();
    evaluateAchievements(state.currentUser);
    showToast('Goal funded', `Allocated ${formatCurrency(amt)} to goal`, 'success');
  } catch (err) {
    console.error('Fund goal failed', err);
    alert(err.message || 'Failed to fund goal');
  }
}