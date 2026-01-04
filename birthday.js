import { db, doc, runTransaction, increment, serverTimestamp } from "./firebase-config.js";
import { transactionsCol } from "./constants.js";
import { showToast } from "./toast.js";
import { getCurrentDate, getCurrentTime } from "./utils.js";
import { state } from "./state.js";

/* Session-level guard to avoid spamming overlay */
let lastBirthdayPromptYear = null;
let birthdayOverlayEl = null;

function isBirthdayToday(bdayStr) {
  if (!bdayStr || !/^\d{4}-\d{2}-\d{2}$/.test(bdayStr)) return false;
  const dob = new Date(bdayStr);
  if (Number.isNaN(dob.getTime())) return false;
  const today = new Date();
  return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
}

function closeBirthdayOverlay() {
  if (birthdayOverlayEl) {
    try {
      birthdayOverlayEl.remove();
    } catch {}
    birthdayOverlayEl = null;
  }
}

function createBirthdayOverlay(user, yearKey) {
  closeBirthdayOverlay();
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Birthday reward");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "99999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(4px)",
    padding: "20px"
  });

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    background: "linear-gradient(145deg,#0f172a,#111827)",
    color: "#f8fafc",
    borderRadius: "16px",
    padding: "24px",
    maxWidth: "420px",
    width: "100%",
    boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
    border: "1px solid rgba(212,175,55,0.4)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "14px"
  });

  const title = document.createElement("h2");
  title.textContent = `Happy Birthday, ${user.fname || "there"}! 🎉`;
  title.style.margin = "0";
  title.style.fontSize = "22px";

  const body = document.createElement("p");
  body.textContent = "Claim your ₱500 birthday gift or close this message anytime.";
  body.style.margin = "0";
  body.style.color = "#e5e7eb";

  const amount = document.createElement("div");
  amount.textContent = "₱500 Birthday Gift";
  Object.assign(amount.style, {
    fontSize: "26px",
    fontWeight: "800",
    color: "#d4af37"
  });

  const buttonsRow = document.createElement("div");
  Object.assign(buttonsRow.style, {
    display: "flex",
    gap: "12px",
    marginTop: "4px",
    flexWrap: "wrap"
  });

  const claimBtn = document.createElement("button");
  claimBtn.textContent = "Claim ₱500";
  Object.assign(claimBtn.style, {
    flex: "1",
    minWidth: "120px",
    padding: "12px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #34d399, #059669)",
    color: "#0b0b0b",
    fontWeight: "800",
    cursor: "pointer"
  });
  claimBtn.onclick = () => claimBirthdayGift(user.id, yearKey, overlay);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Exit";
  Object.assign(closeBtn.style, {
    flex: "1",
    minWidth: "120px",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#e5e7eb",
    fontWeight: "700",
    cursor: "pointer"
  });
  closeBtn.onclick = () => {
    closeBirthdayOverlay();
    lastBirthdayPromptYear = yearKey;
  };

  buttonsRow.appendChild(claimBtn);
  buttonsRow.appendChild(closeBtn);

  panel.appendChild(title);
  panel.appendChild(body);
  panel.appendChild(amount);
  panel.appendChild(buttonsRow);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  birthdayOverlayEl = overlay;
}

/**
 * Shows birthday overlay if today is user's birthday, unclaimed for the year.
 * Also sets lastBirthdayPromptYear to avoid repeat in session.
 */
export function maybeCreateBirthdayNotification(user) {
  if (!user || !user.birthday) return;
  const today = new Date();
  const yearKey = String(today.getFullYear());
  if (lastBirthdayPromptYear === yearKey) return;
  if (!isBirthdayToday(user.birthday)) return;
  const claimed = Array.isArray(user.birthdayGiftsClaimed) ? user.birthdayGiftsClaimed : [];
  if (claimed.includes(yearKey)) return;

  createBirthdayOverlay(user, yearKey);
  lastBirthdayPromptYear = yearKey;
}

/**
 * Claim birthday gift: adds ₱500, records transaction, marks year as claimed.
 */
export async function claimBirthdayGift(userId, yearKey, overlayEl = null) {
  if (!userId || !yearKey) return;
  try {
    await runTransaction(db, async (t) => {
      const uRef = doc(db, "users", userId);
      const snap = await t.get(uRef);
      if (!snap.exists()) throw new Error("User not found");
      const data = snap.data();
      const claimedArr = Array.isArray(data.birthdayGiftsClaimed) ? data.birthdayGiftsClaimed : [];
      if (claimedArr.includes(yearKey)) throw new Error("Already claimed");
      const updated = [...claimedArr, yearKey];
      t.update(uRef, { balance: increment(500), birthdayGiftsClaimed: updated });
      const txRef = doc(transactionsCol);
      t.set(txRef, {
        type: "BDAY_GIFT",
        username: data.username,
        userId: uRef.id,
        amount: 500,
        date: getCurrentDate(),
        time: getCurrentTime(),
        note: `Birthday gift for ${yearKey}`,
        category: "Birthday",
        balanceAfter: (data.balance || 0) + 500,
        createdAt: serverTimestamp()
      });
    });
    if (overlayEl) {
      try {
        overlayEl.remove();
      } catch {}
      birthdayOverlayEl = null;
    }
    showToast("Birthday Gift Claimed", "₱500 has been added to your balance!", "success");
    // refresh balance shown
    if (state.currentUser) {
      state.currentUser.balance = (state.currentUser.balance || 0) + 500;
    }
  } catch (err) {
    if (err && err.code === "permission-denied") {
      showToast("Permission needed", "Cannot claim birthday gift. Contact support/admin.", "error");
      return;
    }
    showToast("Birthday Gift", err.message || "Failed to claim gift", "error");
  }
}