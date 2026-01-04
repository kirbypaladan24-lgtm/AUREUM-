import {
  db,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  increment
} from "./firebase-config.js";
import { state } from "./state.js";
import { scheduledCol, usersCol, transactionsCol } from "./constants.js";
import { formatCurrency, getCurrentDate, getCurrentTime } from "./utils.js";
import { showMessage, showToast } from "./toast.js";

/* Helpers */
function advanceNextRun(sched) {
  const d = new Date(sched.nextRun);
  if (sched.frequency === "daily") d.setDate(d.getDate() + 1);
  else if (sched.frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (sched.frequency === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

/* CRUD */
export async function addScheduledTransfer() {
  if (!state.currentUser) return;
  const to = document.getElementById("schedUser").value.trim();
  const amt = parseFloat(document.getElementById("schedAmount").value);
  const freq = document.getElementById("schedFrequency").value;
  const start = document.getElementById("schedStart").value;
  const note = document.getElementById("schedNote").value.trim();

  if (!to || !amt || amt <= 0 || !start) {
    showMessage("scheduledMessage", "Fill recipient, amount, and start date.", "error");
    return;
  }
  await addDoc(scheduledCol, {
    from: state.currentUser.username,
    fromId: state.currentUser.id,
    to,
    amount: amt,
    frequency: freq,
    nextRun: start,
    note,
    createdAt: serverTimestamp()
  });
  showMessage("scheduledMessage", "Scheduled transfer added.", "success");
  showToast("Scheduled", `Auto transfer to ${to} every ${freq}`, "success");
  renderScheduled();
}

export async function deleteScheduled(id) {
  await deleteDoc(doc(db, "scheduled_transfers", id));
  renderScheduled();
}

export async function runOneScheduled(id) {
  try {
    const sRef = doc(db, "scheduled_transfers", id);
    const sSnap = await getDoc(sRef);
    if (!sSnap.exists()) throw new Error("Scheduled item not found.");
    const s = sSnap.data();

    const fromUserSnap = await getDocs(query(usersCol, where("username", "==", s.from), where("__name__", "==", s.fromId)));
    const toUserSnap = await getDocs(query(usersCol, where("username", "==", s.to)));
    if (fromUserSnap.empty || toUserSnap.empty) throw new Error("User missing.");
    const fromDoc = fromUserSnap.docs[0];
    const toDoc = toUserSnap.docs[0];

    await runTransaction(db, async (t) => {
      const fSnap = await t.get(fromDoc.ref);
      const tSnap = await t.get(toDoc.ref);
      if (!fSnap.exists() || !tSnap.exists()) throw new Error("User missing");
      if ((fSnap.data().balance || 0) < s.amount) throw new Error("Insufficient balance.");
      t.update(fromDoc.ref, { balance: increment(-s.amount) });
      t.update(toDoc.ref, { balance: increment(s.amount) });
      const txRef = doc(transactionsCol);
      t.set(txRef, {
        type: "TRANSFER",
        username: s.from,
        userId: fromDoc.id,
        recipient: s.to,
        recipientId: toDoc.id,
        amount: s.amount,
        date: getCurrentDate(),
        time: getCurrentTime(),
        fee: 0,
        note: s.note || "Scheduled",
        category: "Scheduled",
        createdAt: serverTimestamp()
      });
      const next = advanceNextRun(s);
      t.update(sRef, { nextRun: next });
    });

    showToast("Scheduled transfer", "Executed successfully.", "success");
    renderScheduled();
  } catch (err) {
    console.error("Run scheduled failed", err);
    alert(err.message || "Failed to run scheduled transfer.");
  }
}

export async function renderScheduled() {
  const list = document.getElementById("scheduledList");
  if (!list || !state.currentUser) return;
  const mineSnap = await getDocs(query(scheduledCol, where("fromId", "==", state.currentUser.id)));
  const mine = mineSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (mine.length === 0) {
    list.innerHTML = '<div class="info-box">No scheduled transfers.</div>';
    return;
  }
  list.innerHTML = mine
    .map(
      (s) => `
    <div class="transaction-item">
      <div class="transaction-header">To ${s.to} • ${formatCurrency(s.amount)}</div>
      <div class="transaction-details">Every ${s.frequency} | Next: ${s.nextRun}${s.note ? "<br>" + s.note : ""}</div>
      <div class="flex" style="margin-top:8px;">
        <button class="secondary" style="flex:1" onclick="runOneScheduled('${s.id}')">Run Now</button>
        <button class="danger" style="flex:1" onclick="deleteScheduled('${s.id}')">Delete</button>
      </div>
    </div>`
    )
    .join("");
}

/**
 * Run due scheduled transfers for the current user (called on login/biometric).
 */
export function runScheduledForUser() {
  if (!state.currentUser) return;
  (async () => {
    try {
      const today = getCurrentDate();
      const q = query(scheduledCol, where("fromId", "==", state.currentUser.id));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const s = d.data();
        if (s.nextRun && s.nextRun <= today) {
          try {
            await runOneScheduled(d.id);
          } catch (e) {
            console.warn("Scheduled run failed", d.id, e);
          }
        }
      }
    } catch (err) {
      console.error("runScheduledForUser error", err);
    }
  })();
}