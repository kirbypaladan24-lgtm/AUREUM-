import {
  db,
  doc,
  runTransaction,
  increment,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "./firebase-config.js";
import { state } from "./state.js";
import { usersCol, transactionsCol, BILLERS, ACCOUNT_TYPES, WITHDRAWAL_TAX_RATE, ADMIN_USERNAME } from "./constants.js";
import { formatCurrency, getCurrentDate, getCurrentTime } from "./utils.js";
import { showMessage, showToast } from "./toast.js";
import { guardHighValue } from "./otp.js";
import { logAuditEvent } from "./audit.js";
import { evaluateAchievements } from "./achievements.js";
import { showPage, clearInputsInPage, updateBalance } from "./navigation.js";
import { updateLimitDisplays } from "./limits.js";

/* Module-scoped pending receipt snapshot (static) */
let pendingReceipt = null;
function setPendingReceipt(data) {
  pendingReceipt = data ? { ...data } : null;
}

/* Visible accounts (exclude admin) */
export function getVisibleAccounts() {
  if (!Array.isArray(state.accounts)) return [];
  return state.accounts.filter((a) => {
    const uname = (a && a.username) ? String(a.username).toLowerCase() : "";
    return uname !== String(ADMIN_USERNAME).toLowerCase();
  });
}

/* Billers */
export function renderBillers() {
  const select = document.getElementById("billPayBiller");
  if (!select) return;
  select.innerHTML = BILLERS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
}

/* Withdraw */
export async function processWithdraw() {
  if (!state.currentUser) {
    showMessage("withdrawMessage", "Not logged in", "error");
    return;
  }
  const amount = parseFloat(document.getElementById("withdrawAmount").value);
  const category = document.getElementById("withdrawCategory").value;
  const note = document.getElementById("withdrawNote").value.trim();

  if (!amount || amount <= 0) {
    showMessage("withdrawMessage", "Enter a valid amount", "error");
    return;
  }

  const proceed = async () => {
    try {
      const tax = Math.round(amount * WITHDRAWAL_TAX_RATE * 100) / 100;
      const totalDebit = amount + tax;
      const typeMeta = ACCOUNT_TYPES[state.currentUser.accountType] || ACCOUNT_TYPES.savings;

      await runTransaction(db, async (t) => {
        const uRef = doc(db, "users", state.currentUser.id);
        const uSnap = await t.get(uRef);
        if (!uSnap.exists()) throw new Error("User not found");
        const uData = uSnap.data();
        const today = getCurrentDate();
        let limitsDaily = uData.limitsDaily || { date: null, withdrawUsed: 0, transferUsed: 0 };
        if (limitsDaily.date !== today) limitsDaily = { date: today, withdrawUsed: 0, transferUsed: 0 };
        if ((uData.balance || 0) < totalDebit) throw new Error("Insufficient funds");
        if ((limitsDaily.withdrawUsed || 0) + amount > typeMeta.withdrawLimit) throw new Error("Daily withdraw limit exceeded");

        limitsDaily.withdrawUsed = (limitsDaily.withdrawUsed || 0) + amount;

        const newBalance = (uData.balance || 0) - totalDebit;
        t.update(uRef, { balance: newBalance, limitsDaily });

        const txPayload = {
          type: "WITHDRAWAL",
          username: uSnap.data().username,
          userId: uRef.id,
          amount,
          date: getCurrentDate(),
          time: getCurrentTime(),
          fee: tax,
          note,
          category,
          balanceAfter: newBalance,
          createdAt: serverTimestamp()
        };
        const txRef = doc(transactionsCol);
        t.set(txRef, txPayload);

        const { createdAt, ...lt } = txPayload;
        t.update(uRef, { lastTransaction: lt });

        setPendingReceipt(lt);
      });

      showToast("Withdrawal successful", `You withdrew ${formatCurrency(amount)}`, "success");
      logAuditEvent({ action: "WITHDRAWAL", details: { amount, fee: Math.round(amount * WITHDRAWAL_TAX_RATE * 100) / 100 } });
      clearInputsInPage("withdrawPage");
      showReceipt();
    } catch (err) {
      console.error("Withdraw failed", err);
      showMessage("withdrawMessage", err.message || "Withdrawal failed", "error");
    }
  };

  guardHighValue(amount, proceed);
}

/* Deposit */
export async function processDeposit() {
  if (!state.currentUser) {
    showMessage("depositMessage", "Not logged in", "error");
    return;
  }
  const amount = parseFloat(document.getElementById("depositAmount").value);
  const category = document.getElementById("depositCategory").value;
  const note = document.getElementById("depositNote").value.trim();

  if (!amount || amount <= 0) {
    showMessage("depositMessage", "Enter a valid amount", "error");
    return;
  }

  try {
    await runTransaction(db, async (t) => {
      const uRef = doc(db, "users", state.currentUser.id);
      const uSnap = await t.get(uRef);
      if (!uSnap.exists()) throw new Error("User not found");
      const newBalance = (uSnap.data().balance || 0) + amount;
      t.update(uRef, { balance: newBalance });

      const txPayload = {
        type: "DEPOSIT",
        username: uSnap.data().username,
        userId: uRef.id,
        amount,
        date: getCurrentDate(),
        time: getCurrentTime(),
        fee: 0.0,
        note,
        category,
        balanceAfter: newBalance,
        createdAt: serverTimestamp()
      };
      const txRef = doc(transactionsCol);
      t.set(txRef, txPayload);

      const { createdAt, ...lt } = txPayload;
      t.update(uRef, { lastTransaction: lt });

      setPendingReceipt(lt);
    });

    showToast("Deposit successful", `You deposited ${formatCurrency(amount)}`, "success");
    evaluateAchievements(state.currentUser);
    clearInputsInPage("depositPage");
    showReceipt();
  } catch (err) {
    console.error("Deposit failed", err);
    showMessage("depositMessage", err.message || "Deposit failed", "error");
  }
}

/* Verify recipient */
export function verifyTransferRecipient() {
  const username = document.getElementById("transferUsername").value.trim();
  if (username) {
    const recipient = state.accounts.find((acc) => acc.username === username);
    if (recipient) {
      document.getElementById("transferRecipientName").textContent = `${recipient.fname} ${recipient.lname}`;
      document.getElementById("transferRecipientInfo").style.display = "block";
      document.getElementById("transferMessage").innerHTML = "";
    } else {
      document.getElementById("transferRecipientInfo").style.display = "none";
      showMessage("transferMessage", "User not found", "error");
    }
  }
}

/* Render favorites */
export function renderFavorites() {
  const container = document.getElementById("favoritesList");
  if (!container) return;
  container.innerHTML = "";
  if (!state.currentUser || !state.currentUser.favorites || state.currentUser.favorites.length === 0) {
    container.innerHTML = '<span class="tiny">No favorites yet</span>';
    return;
  }
  state.currentUser.favorites.slice(0, 6).forEach((u) => {
    const btn = document.createElement("button");
    btn.className = "pill-btn";
    btn.textContent = u;
    btn.onclick = () => {
      document.getElementById("transferUsername").value = u;
      verifyTransferRecipient();
    };
    container.appendChild(btn);
  });
}

/* Transfer */
export async function processTransfer() {
  if (!state.currentUser) {
    showMessage("transferMessage", "Not logged in", "error");
    return;
  }
  const username = document.getElementById("transferUsername").value.trim();
  const amount = parseFloat(document.getElementById("transferAmount").value);
  const category = document.getElementById("transferCategory").value;
  const note = document.getElementById("transferNote").value.trim();

  if (!username || !amount || amount <= 0) {
    showMessage("transferMessage", "Enter valid recipient and amount", "error");
    return;
  }

  if (username === state.currentUser.username) {
    showMessage("transferMessage", "Cannot transfer to yourself", "error");
    return;
  }

  const recipient = state.accounts.find((acc) => acc.username === username);
  if (!recipient) {
    showMessage("transferMessage", "Recipient not found", "error");
    return;
  }

  const proceed = async () => {
    try {
      await runTransaction(db, async (t) => {
        const senderRef = doc(db, "users", state.currentUser.id);
        const recipientRef = doc(db, "users", recipient.id);
        const sSnap = await t.get(senderRef);
        const rSnap = await t.get(recipientRef);
        if (!sSnap.exists() || !rSnap.exists()) throw new Error("User missing");

        const sData = sSnap.data();
        const typeMeta = ACCOUNT_TYPES[sData.accountType] || ACCOUNT_TYPES.savings;
        const today = getCurrentDate();
        let limitsDaily = sData.limitsDaily || { date: today, withdrawUsed: 0, transferUsed: 0 };
        if (limitsDaily.date !== today) limitsDaily = { date: today, withdrawUsed: 0, transferUsed: 0 };
        let limitsMonthly = sData.limitsMonthly || { month: null, transferUsed: 0 };
        const key = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
        if (limitsMonthly.month !== key) limitsMonthly = { month: key, transferUsed: 0 };

        if ((limitsDaily.transferUsed || 0) + amount > typeMeta.transferLimit) throw new Error("Daily transfer limit exceeded");
        if ((limitsMonthly.transferUsed || 0) + amount > typeMeta.monthlyTransfer) throw new Error("Monthly transfer limit exceeded");
        if ((sData.balance || 0) < amount) throw new Error("Insufficient funds");

        limitsDaily.transferUsed = (limitsDaily.transferUsed || 0) + amount;
        limitsMonthly.transferUsed = (limitsMonthly.transferUsed || 0) + amount;

        const newSenderBalance = (sData.balance || 0) - amount;
        const newRecipientBalance = (rSnap.data().balance || 0) + amount;

        t.update(senderRef, { balance: newSenderBalance, limitsDaily, limitsMonthly });
        t.update(recipientRef, { balance: newRecipientBalance });

        const txPayload = {
          type: "TRANSFER",
          username: sData.username,
          userId: senderRef.id,
          recipient: rSnap.data().username,
          recipientId: recipientRef.id,
          amount,
          date: getCurrentDate(),
          time: getCurrentTime(),
          fee: 0.0,
          note,
          category,
          senderBalanceAfter: newSenderBalance,
          recipientBalanceAfter: newRecipientBalance,
          createdAt: serverTimestamp()
        };
        const txRef = doc(transactionsCol);
        t.set(txRef, txPayload);

        t.update(senderRef, {
          lastTransaction: {
            type: "TRANSFER",
            amount,
            date: getCurrentDate(),
            time: getCurrentTime(),
            recipient: rSnap.data().username,
            fee: 0.0,
            note,
            category,
            balanceAfter: newSenderBalance
          }
        });
        t.update(recipientRef, {
          lastTransaction: {
            type: "TRANSFER-IN",
            amount,
            date: getCurrentDate(),
            time: getCurrentTime(),
            recipient: sData.username,
            fee: 0.0,
            note,
            category,
            balanceAfter: newRecipientBalance
          }
        });

        setPendingReceipt({
          type: "TRANSFER",
          amount,
          date: getCurrentDate(),
          time: getCurrentTime(),
          fee: 0,
          note,
          category,
          recipient: rSnap.data().username,
          balanceAfter: newSenderBalance
        });
      });

      showToast("Transfer sent", `You sent ${formatCurrency(amount)} to ${recipient.username}`, "success");
      logAuditEvent({ action: "TRANSFER", details: { amount, to: recipient.username } });
      clearInputsInPage("transferPage");
      showReceipt();
      evaluateAchievements(state.currentUser);
    } catch (err) {
      console.error("Transfer failed", err);
      showMessage("transferMessage", err.message || "Transfer failed", "error");
    }
  };

  guardHighValue(amount, proceed);
}

/* Bill payment */
export async function processBillPayment() {
  if (!state.currentUser) {
    showMessage("billPayMessage", "Not logged in", "error");
    return;
  }
  const billerId = document.getElementById("billPayBiller").value;
  const accountNumber = document.getElementById("billPayAccount").value.trim();
  const amount = parseFloat(document.getElementById("billPayAmount").value);
  const note = document.getElementById("billPayNote").value.trim();
  const biller = BILLERS.find((b) => b.id === billerId);

  if (!biller || !amount || amount <= 0 || !accountNumber) {
    showMessage("billPayMessage", "Fill biller, account number, and amount.", "error");
    return;
  }
  if (!biller.accountFormat.test(accountNumber)) {
    showMessage("billPayMessage", "Invalid account number format for this biller.", "error");
    return;
  }

  const proceed = async () => {
    try {
      await runTransaction(db, async (t) => {
        const uRef = doc(db, "users", state.currentUser.id);
        const uSnap = await t.get(uRef);
        if (!uSnap.exists()) throw new Error("User not found");
        if ((uSnap.data().balance || 0) < amount) throw new Error("Insufficient balance");
        const newBalance = (uSnap.data().balance || 0) - amount;
        t.update(uRef, { balance: newBalance });
        const record = {
          type: "BILL_PAYMENT",
          username: uSnap.data().username,
          userId: uRef.id,
          billerId,
          billerName: biller.name,
          accountNumber,
          amount,
          date: getCurrentDate(),
          time: getCurrentTime(),
          note,
          balanceAfter: newBalance,
          createdAt: serverTimestamp()
        };
        const recRef = doc(transactionsCol);
        t.set(recRef, record);
        t.update(uRef, {
          lastTransaction: {
            type: "BILL PAYMENT",
            amount,
            date: record.date,
            time: record.time,
            fee: 0,
            note,
            category: biller.name,
            recipient: biller.name,
            balanceAfter: newBalance
          }
        });

        setPendingReceipt({
          type: "BILL PAYMENT",
          amount,
          date: record.date,
          time: record.time,
          fee: 0,
          note,
          category: biller.name,
          recipient: biller.name,
          balanceAfter: newBalance
        });
      });
      updateBalance();
      showMessage("billPayMessage", "Bill paid successfully.", "success");
      showToast("Bill paid", `${biller.name} ${formatCurrency(amount)}`, "success");
      logAuditEvent({ action: "BILL_PAY", details: { biller: biller.name, amount } });
      clearInputsInPage("billPayPage");
      showReceipt();
    } catch (err) {
      console.error("Bill pay failed", err);
      showMessage("billPayMessage", err.message || "Bill payment failed", "error");
    }
  };

  guardHighValue(amount, proceed);
}

/* Fee preview */
export function calculateWithdrawFee() {
  const amount = parseFloat(document.getElementById("withdrawAmount").value);
  updateLimitDisplays();
  if (amount > 0) {
    const tax = Math.round(amount * WITHDRAWAL_TAX_RATE * 100) / 100;
    const total = amount + tax;
    const elAmount = document.getElementById("withdrawSummaryAmount");
    const elFee = document.getElementById("withdrawSummaryFee");
    const elTotal = document.getElementById("withdrawSummaryTotal");
    if (elAmount) elAmount.textContent = amount.toFixed(2);
    if (elFee) elFee.textContent = tax.toFixed(2);
    if (elTotal) elTotal.textContent = total.toFixed(2);
    const ws = document.getElementById("withdrawSummary");
    if (ws) ws.style.display = "block";
  } else {
    const ws = document.getElementById("withdrawSummary");
    if (ws) ws.style.display = "none";
  }
}

/* Statement */
export async function loadStatement() {
  if (!state.currentUser) return;
  try {
    const myId = state.currentUser.id;
    const q1 = query(transactionsCol, where("userId", "==", myId));
    const q2 = query(transactionsCol, where("recipientId", "==", myId));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const transactions = [];
    const seen = new Set();
    const pushUnique = (snap) =>
      snap.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          transactions.push({ id: d.id, ...d.data() });
        }
      });
    pushUnique(snap1);
    pushUnique(snap2);
    transactions.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    const html =
      transactions.length === 0
        ? '<div class="info-box">No transactions found.</div>'
        : transactions
            .map(
              (t) => `
<div class="transaction-item ${t.type && (t.type.startsWith("TRANSFER") || t.type === "WITHDRAWAL" || t.type === "BILL_PAYMENT") ? "expense" : "income"}" onclick="openStatementReceipt('${t.id}')" style="cursor:pointer;">
  <div class="transaction-header">${t.type} ${t.category ? " • " + t.category : ""}</div>
  <div class="transaction-details">
    Amount: ${formatCurrency(t.amount)} | ${t.date || ""} ${t.time || ""}
    ${t.note ? `<br>${t.note}` : ""}
  </div>
</div>
`
            )
            .join("");
    document.getElementById("statementList").innerHTML = html;
  } catch (err) {
    console.error("Statement load failed", err);
    document.getElementById("statementList").innerHTML = '<div class="info-box">Failed to load transactions.</div>';
  }
}

/* Open receipt from transaction doc (static) */
export async function openStatementReceipt(txId) {
  try {
    const txRef = doc(db, "transactions", txId);
    const txSnap = await getDoc(txRef);
    if (!txSnap.exists()) {
      showMessage("receiptMessage", "Transaction not found", "error");
      return;
    }
    const t = txSnap.data();
    if (!state.currentUser) return;

    const balanceAfter =
      t.balanceAfter ??
      (t.senderBalanceAfter ?? t.recipientBalanceAfter ?? state.currentUser.balance);

    setPendingReceipt({
      type: t.type,
      amount: t.amount,
      date: t.date,
      time: t.time,
      fee: t.fee || 0,
      note: t.note || "",
      category: t.category || "",
      recipient: t.recipient || null,
      balanceAfter
    });

    showReceipt();
  } catch (err) {
    console.error(err);
    showMessage("receiptMessage", "Failed to open receipt", "error");
  }
}

/* Local receipt (static snapshot) */
export function showReceipt() {
  const t = pendingReceipt || (state.currentUser && state.currentUser.lastTransaction);
  if (!t) {
    showMessage("receiptMessage", "No recent transaction found to print.", "error");
    setTimeout(() => showPage("dashboardPage"), 1000);
    return;
  }

  const accEl = document.getElementById("receiptAccountId");
  const dtEl = document.getElementById("receiptDateTime");
  const typeEl = document.getElementById("receiptType");
  const amtEl = document.getElementById("receiptAmount");
  const balEl = document.getElementById("receiptNewBalance");

  if (accEl) accEl.textContent = state.currentUser ? state.currentUser.username : "";
  if (dtEl) dtEl.textContent = `${t.date} ${t.time}`;
  if (typeEl) typeEl.textContent = t.type;
  if (amtEl) amtEl.textContent = formatCurrency(t.amount);
  if (balEl) balEl.textContent = formatCurrency(t.balanceAfter ?? state.currentUser?.balance ?? 0);

  setReceiptExtras(t);

  pendingReceipt = null;
  if (state.currentUser) state.currentUser.lastTransaction = null;

  showPage("receiptPage");
}

/* Receipt extras */
function setReceiptExtras(t) {
  const feeEl = document.getElementById("receiptFee");
  const recipientEl = document.getElementById("receiptRecipient");
  const noteEl = document.getElementById("receiptNote");
  const catEl = document.getElementById("receiptCategory");

  if (!t) return;
  if (t.fee && t.fee > 0) {
    if (feeEl) {
      feeEl.style.display = "flex";
      feeEl.querySelector("span").textContent = formatCurrency(t.fee);
    }
  } else if (feeEl) feeEl.style.display = "none";

  if (t.recipient) {
    if (recipientEl) {
      recipientEl.style.display = "flex";
      recipientEl.querySelector("span").textContent = t.recipient;
    }
  } else if (recipientEl) recipientEl.style.display = "none";

  if (t.note) {
    if (noteEl) {
      noteEl.style.display = "flex";
      noteEl.querySelector("span").textContent = t.note;
    }
  } else if (noteEl) noteEl.style.display = "none";

  if (t.category) {
    if (catEl) {
      catEl.style.display = "flex";
      catEl.querySelector("span").textContent = t.category;
    }
  } else if (catEl) catEl.style.display = "none";
}