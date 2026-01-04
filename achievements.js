import {
  db,
  getDocs,
  query,
  where,
  addDoc,
  collection
} from "./firebase-config.js";
import { transactionsCol, achievementsCol, ACHIEVEMENT_DEFS } from "./constants.js";
import { getCurrentDate } from "./utils.js";
import { state } from "./state.js";

export async function evaluateAchievements(user) {
  if (!user) return;
  try {
    const username = user.username;
    const userId = user.id;

    const depositSnap = await getDocs(
      query(transactionsCol, where("userId", "==", userId), where("type", "==", "DEPOSIT"))
    );
    const depositCount = depositSnap.size;

    const transferOutSnap = await getDocs(
      query(transactionsCol, where("userId", "==", userId), where("type", "==", "TRANSFER"))
    );
    const transferCount = transferOutSnap.size;

    const userSnap = await getDocs(
      query(collection(db, "users"), where("__name__", "==", userId))
    );
    const uData = userSnap.empty ? {} : userSnap.docs[0].data();
    const balanceVal = uData.balance || 0;

    const goalsSnap = await getDocs(collection(db, "users", userId, "goals"));
    const goalsArr = goalsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const unlockedSnap = await getDocs(
      query(achievementsCol, where("userId", "==", userId))
    );
    const unlocked = new Set(unlockedSnap.docs.map((d) => d.data().id));

    const toUnlock = [];
    if (!unlocked.has("first_deposit") && depositCount >= 1) toUnlock.push("first_deposit");
    if (!unlocked.has("deposit_5") && depositCount >= 5) toUnlock.push("deposit_5");
    if (!unlocked.has("transfer_5") && transferCount >= 5) toUnlock.push("transfer_5");
    if (!unlocked.has("balance_10k") && balanceVal >= 10000) toUnlock.push("balance_10k");
    if (!unlocked.has("balance_50k") && balanceVal >= 50000) toUnlock.push("balance_50k");
    if (!unlocked.has("goal_complete") && goalsArr.some((g) => (g.saved || 0) >= (g.target || 0)))
      toUnlock.push("goal_complete");

    for (const id of toUnlock) {
      await addDoc(achievementsCol, {
        user: username,
        userId,
        id,
        date: getCurrentDate(),
      });
    }
  } catch (err) {
    console.error("Evaluate achievements failed", err);
  }
}

export async function renderAchievements() {
  const box = document.getElementById("achievementsList");
  if (!box || !state.currentUser) return;
  try {
    const unlockedSnap = await getDocs(
      query(achievementsCol, where("userId", "==", state.currentUser.id))
    );
    const unlocked = new Set(unlockedSnap.docs.map((d) => d.data().id));
    box.innerHTML = ACHIEVEMENT_DEFS.map((def) => {
      const got = unlocked.has(def.id);
      return `<div class="badge" style="background:${got?'rgba(52,211,153,0.18)':'rgba(255,255,255,0.05)'};border-color:${got?'rgba(52,211,153,0.4)':'rgba(255,255,255,0.12)'};">
${got?'✅':'🔒'} <div><strong>${def.title}</strong><br><span class="tiny">${def.desc}</span></div>
</div>`;
    }).join("");
  } catch (err) {
    console.error("Render achievements failed", err);
  }
}