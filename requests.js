import {
  db,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "./firebase-config.js";
import { state } from "./state.js";
import { requestsCol, transactionsCol, usersCol } from "./constants.js";
import { showMessage, showToast } from "./toast.js";
import { showPage, clearInputsInPage } from "./navigation.js";
import { formatCurrency, getCurrentDate, getCurrentTime } from "./utils.js";
import { increment, runTransaction } from "./firebase-config.js";
import { createNotification } from "./notifications.js";

/**
 * Render incoming (forMe) and outgoing (byMe) requests.
 * Matches v1: uses #requestsForMe and #requestsByMe containers.
 */
export async function renderRequests() {
  const forMe = document.getElementById("requestsForMe");
  const byMe = document.getElementById("requestsByMe");
  if (!state.currentUser || !forMe || !byMe) return;
  try {
    const incomingSnap = await getDocs(
      query(requestsCol, where("toId", "==", state.currentUser.id), where("status", "==", "pending"))
    );
    const outgoingSnap = await getDocs(query(requestsCol, where("fromId", "==", state.currentUser.id)));
    const incoming = incomingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const outgoing = outgoingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    forMe.innerHTML =
      incoming.length === 0
        ? '<div class="info-box">No pending requests.</div>'
        : incoming
            .map(
              (r) => `<div class="transaction-item">
        <div class="transaction-header">${r.from} requests ${formatCurrency(r.amount)}</div>
        <div class="transaction-details">${r.reason || "No reason"} | ${r.date}</div>
        <div class="flex" style="margin-top:8px;">
          <button class="secondary" style="flex:1" onclick="respondRequest('${r.id}', true)">Approve</button>
          <button class="secondary" style="flex:1" onclick="respondRequest('${r.id}', false)">Decline</button>
        </div>
      </div>`
            )
            .join("");

    byMe.innerHTML =
      outgoing.length === 0
        ? '<div class="info-box">No sent requests.</div>'
        : outgoing
            .map(
              (r) => `<div class="transaction-item">
        <div class="transaction-header">To ${r.to} • ${formatCurrency(r.amount)} (${r.status})</div>
        <div class="transaction-details">${r.reason || "No reason"} | ${r.date}</div>
      </div>`
            )
            .join("");
  } catch (err) {
    console.error("Render requests failed", err);
  }
}

/** Send a P2P request (v1 behavior). */
export async function sendRequest() {
  if (!state.currentUser) return;
  const to = document.getElementById("reqFrom").value.trim();
  const amt = parseFloat(document.getElementById("reqAmount").value);
  const reason = document.getElementById("reqReason").value.trim();
  if (!to || !amt || amt <= 0) {
    showMessage("requestsMessage", "Fill recipient and valid amount.", "error");
    return;
  }
  const recipient = state.accounts.find((a) => a.username === to);
  if (!recipient) {
    showMessage("requestsMessage", "Recipient not found.", "error");
    return;
  }

  try {
    const reqRef = await addDoc(requestsCol, {
      from: state.currentUser.username,
      fromId: state.currentUser.id,
      to,
      toId: recipient.id,
      amount: amt,
      reason,
      status: "pending",
      date: getCurrentDate(),
      createdAt: serverTimestamp()
    });

    showMessage("requestsMessage", "Request sent.", "success");
    showToast("Request sent", `To ${to} for ${formatCurrency(amt)}`, "success");
    clearInputsInPage("requestsPage");
    renderRequests();

    // Persistent notification to recipient (deduped by requestId)
    try {
      await createNotification(
        to,
        "Money Request",
        `${state.currentUser.username} requested ${formatCurrency(amt)} from you.`,
        { type: "REQUEST", requestFrom: state.currentUser.username, amount: amt, requestId: reqRef.id }
      );
    } catch (e) {
      console.warn("Failed to create request notification", e);
    }
  } catch (err) {
    console.error("Send request failed", err);
    showMessage("requestsMessage", "Failed to send request.", "error");
  }
}

/** Respond to a request: approve -> transfer funds; decline -> delete. */
export async function respondRequest(id, approve) {
  if (!state.currentUser) {
    showMessage("requestsMessage", "Not logged in", "error");
    return;
  }
  try {
    const reqRef = doc(db, "requests", id);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return;
    const req = reqSnap.data();
    if (req.status !== "pending") return;

    if (approve) {
      const payerRef = doc(db, "users", req.toId);
      const payeeRef = doc(db, "users", req.fromId);
      const payerDoc = await getDoc(payerRef);
      const payeeDoc = await getDoc(payeeRef);
      if (!payerDoc.exists() || !payeeDoc.exists()) {
        alert("User missing.");
        return;
      }
      if ((payerDoc.data().balance || 0) < req.amount) throw new Error("Insufficient balance.");
      await runTransaction(db, async (t) => {
        const pSnap = await t.get(payerRef);
        const paySnap = await t.get(payeeRef);
        if (!pSnap.exists() || !paySnap.exists()) throw new Error("User missing");
        t.update(payerRef, { balance: increment(-req.amount) });
        t.update(payeeRef, { balance: increment(req.amount) });
        const txRef = doc(transactionsCol);
        t.set(txRef, {
          type: "TRANSFER",
          username: pSnap.data().username,
          userId: payerRef.id,
          recipient: paySnap.data().username,
          recipientId: payeeRef.id,
          amount: req.amount,
          date: getCurrentDate(),
          time: getCurrentTime(),
          fee: 0,
          note: req.reason || "Request approval",
          category: "Request",
          createdAt: serverTimestamp()
        });
      });
    }
    await updateDoc(reqRef, { status: approve ? "approved" : "declined" });

    // Notify requester about response (deduped by requestId)
    try {
      const respMessage = approve
        ? `Your request to ${req.to} for ${formatCurrency(req.amount)} was approved.`
        : `Your request to ${req.to} for ${formatCurrency(req.amount)} was declined.`;
      await createNotification(req.from, "Request Response", respMessage, {
        type: "REQUEST_RESPONSE",
        requestId: id,
        status: approve ? "approved" : "declined"
      });
    } catch (e) {
      console.warn("Failed to create response notification", e);
    }

    renderRequests();
    showToast("Request updated", `Status: ${approve ? "approved" : "declined"}`, approve ? "success" : "warning");
  } catch (err) {
    console.error("Respond request failed", err);
    alert(err.message || "Failed to process request");
  }
}