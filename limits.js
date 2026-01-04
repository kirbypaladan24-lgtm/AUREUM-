import { getCurrentDate } from "./utils.js";
import { state } from "./state.js";

export function ensureLimitStructures(user) {
  if (!user) return;
  const today = getCurrentDate();
  const monthKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;

  if (!user.limitsDaily || user.limitsDaily.date !== today) {
    user.limitsDaily = { date: today, withdrawUsed: 0, transferUsed: 0 };
  }
  if (!user.limitsMonthly || user.limitsMonthly.month !== monthKey) {
    user.limitsMonthly = { month: monthKey, transferUsed: 0 };
  }
}

export function updateLimitDisplays() {
  const dailyEl = document.getElementById("dailyLimitUsed");
  const monthlyEl = document.getElementById("monthlyLimitUsed");
  if (!dailyEl || !monthlyEl || !state.currentUser) return;

  const { limitsDaily = {}, limitsMonthly = {} } = state.currentUser;
  dailyEl.textContent = `${(limitsDaily.transferUsed || 0).toFixed(2)}`;
  monthlyEl.textContent = `${(limitsMonthly.transferUsed || 0).toFixed(2)}`;
}