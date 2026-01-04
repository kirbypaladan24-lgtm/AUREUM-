import { getDocs, query, where, orderBy, limit } from "./firebase-config.js";
import { usersCol, transactionsCol, ADMIN_USERNAME } from "./constants.js";
import { formatCurrency } from "./utils.js";

/**
 * Personal analytics (per-user) — matches v1 behavior.
 */
export async function renderAnalytics() {
  const sumBox = document.getElementById("analyticsSummary");
  const catBox = document.getElementById("categoryBreakdown");
  const insightsBox = document.getElementById("insightsBox");
  const state = (await import("./state.js")).state;
  if (!state.currentUser || !sumBox || !catBox || !insightsBox) return;

  try {
    const myId = state.currentUser.id;
    const myDepositsSnap = await getDocs(query(transactionsCol, where("userId", "==", myId), where("type", "==", "DEPOSIT")));
    const myWithdrawsSnap = await getDocs(query(transactionsCol, where("userId", "==", myId), where("type", "==", "WITHDRAWAL")));
    const myTransfersOutSnap = await getDocs(query(transactionsCol, where("userId", "==", myId), where("type", "==", "TRANSFER")));
    const myTransfersInSnap = await getDocs(query(transactionsCol, where("recipientId", "==", myId), where("type", "==", "TRANSFER")));
    const myBillsSnap = await getDocs(query(transactionsCol, where("userId", "==", myId), where("type", "==", "BILL_PAYMENT")));

    const myDeposits = myDepositsSnap.docs.map((d) => d.data());
    const myWithdraws = myWithdrawsSnap.docs.map((d) => d.data());
    const myTransfersOut = myTransfersOutSnap.docs.map((d) => d.data());
    const myTransfersIn = myTransfersInSnap.docs.map((d) => d.data());
    const myBills = myBillsSnap.docs.map((d) => d.data());

    const totalIn = myDeposits.reduce((s, t) => s + t.amount, 0) + myTransfersIn.reduce((s, t) => s + t.amount, 0);
    const totalOut =
      myWithdraws.reduce((s, t) => s + t.amount, 0) +
      myTransfersOut.reduce((s, t) => s + t.amount, 0) +
      myBills.reduce((s, t) => s + t.amount, 0);
    const net = totalIn - totalOut;

    sumBox.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div>Total In</div><div class="value" style="color:#34d399;">${formatCurrency(totalIn)}</div></div>
        <div class="stat-card"><div>Total Out</div><div class="value" style="color:#ef4444;">${formatCurrency(totalOut)}</div></div>
        <div class="stat-card"><div>Net</div><div class="value" style="color:${net >= 0 ? "#34d399" : "#ef4444"};">${formatCurrency(net)}</div></div>
        <div class="stat-card"><div>Balance</div><div class="value">${formatCurrency(state.currentUser.balance)}</div></div>
      </div>
    `;

    const catTotals = {};
    myWithdraws.forEach((t) => {
      const c = t.category || "Others";
      catTotals[c] = (catTotals[c] || 0) + t.amount;
    });
    myTransfersOut.forEach((t) => {
      const c = t.category || "Others";
      catTotals[c] = (catTotals[c] || 0) + t.amount;
    });
    myBills.forEach((t) => {
      const c = t.billerName || "Bills";
      catTotals[c] = (catTotals[c] || 0) + t.amount;
    });
    const entries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      catBox.innerHTML = '<div class="info-box">No spending data yet.</div>';
    } else {
      catBox.innerHTML =
        `<h4 style="margin-bottom:10px;">Top Spending Categories</h4>` +
        entries
          .map(
            ([c, v]) => `
          <div class="transaction-item expense">
            <div class="transaction-header">${c}</div>
            <div class="transaction-details">${formatCurrency(v)}</div>
          </div>`
          )
          .join("");
    }

    const insights = generateSpendingInsights(entries);
    insightsBox.innerHTML =
      insights.length === 0
        ? '<div class="info-box">No insights yet.</div>'
        : insights
            .map(
              (ins) => `<div class="info-box ${ins.type === "warning" ? "warning" : "success"}">${ins.message}</div>`
            )
            .join("");
  } catch (err) {
    console.error("Render analytics failed", err);
  }
}

function generateSpendingInsights(entries) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const insights = [];
  entries.forEach(([cat, val]) => {
    const pct = total ? (val / total) * 100 : 0;
    if (pct > 35) insights.push({ type: "warning", message: `High spend on ${cat}: ${pct.toFixed(1)}% of spending.` });
    if (pct < 5) insights.push({ type: "success", message: `Healthy low spend on ${cat} at ${pct.toFixed(1)}%.` });
  });
  return insights.slice(0, 5);
}

/**
 * Leaderboard — v1-style table UI.
 */
export async function renderLeaderboard() {
  const list = document.getElementById("leaderboardList");
  if (!list) return;
  try {
    const snap = await getDocs(query(usersCol, orderBy("balance", "desc"), limit(20)));
    if (snap.empty) {
      list.innerHTML = '<div class="info-box">No accounts.</div>';
      return;
    }
    const sorted = snap.docs
      .map((d) => d.data())
      .filter((a) => String(a.username).toLowerCase() !== String(ADMIN_USERNAME).toLowerCase());

    list.innerHTML = `
      <table class="table-like">
        <thead><tr><th>#</th><th>User</th><th>Name</th><th>Balance</th></tr></thead>
        <tbody>
          ${sorted
            .map(
              (a, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${a.username}</td>
              <td>${a.fname || ""} ${a.lname || ""}</td>
              <td>${formatCurrency(a.balance || 0)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  } catch (err) {
    console.error("Leaderboard failed", err);
    list.innerHTML = '<div class="info-box">Failed to load leaderboard.</div>';
  }
}