// Root bootstrap: attach all UI-facing functions to window (inline onclick support)

import { state } from "./state.js";
import {
  showPage,
  goBack,
  toggleDarkMode,
  clearInputsInPage,
  updateHeader,
  triggerCardAnimation,
  clearAllMessages,
  loadDarkModePreference,
  renderAtmCard,
  updateBalance
} from "./navigation.js";
import {
  showKeypad,
  hideKeypad,
  keypadInput,
  keypadDelete,
  initPinEyeToggles,
  securePinInputs,
  ensureVirtualKeypad
} from "./keypad.js";
import {
  renderBillers,
  renderFavorites,
  processWithdraw,
  processDeposit,
  processTransfer,
  processBillPayment,
  loadStatement,
  openStatementReceipt,
  showReceipt,
  calculateWithdrawFee
} from "./transactions.js";
import {
  login,
  signup,
  logout,
  startPinRecovery,
  verifyPinAnswer,
  setNewPin,
  processChangePin,
  processChangeName,
  processChangePhone,
  processChangeAddress,
  processChangeUsername
} from "./auth.js";
import { addGoal, fundGoal, renderGoals } from "./goals.js";
import { addScheduledTransfer, runOneScheduled, deleteScheduled, renderScheduled, runScheduledForUser } from "./scheduled.js";
import { sendRequest, renderRequests, respondRequest } from "./requests.js";
import {
  adminViewPhoneNumbers,
  adminApplyInterest,
  exportData,
  triggerImport,
  adminSystemReboot,
  adminModifyUserAction,
  confirmDeleteAccount,
  processModifyAccount,
  renderTransactionHistory,
  adminLocationDetail,
  adminViewUser,
  adminViewTransactionChart,
  adminViewLocationsMenu,
  renderAllAccounts,
  renderSearchableAccountList,
  filterAccountList
} from "./admin.js";
import { renderAnalytics, renderLeaderboard } from "./analytics.js";
import { renderAchievements } from "./achievements.js";
import { updateLimitDisplays } from "./limits.js";
import {
  toggleNotificationPanel,
  handleNotificationClick,
  markAllNotificationsAsRead,
  deleteAllNotifications,
  deleteNotification,
  clearLocalNotificationsView,
  ensureNotificationUI,
  loadLocallyDeletedIds,
  startNotificationsListener,
  updateBellDotPublic
} from "./notifications.js";
import { attachInactivityListeners, resetInactivityTimer, clearInactivityTimer } from "./inactivity.js";
import { tryBiometricLogin, enableBiometricFlow } from "./biometric.js";
import { showToast, dismissToastByTitle } from "./toast.js";
import { logAuditEvent } from "./audit.js";

// NEW: listeners to keep admin users/requests visible
import { onSnapshot } from "./firebase-config.js";
import { usersCol, requestsCol } from "./constants.js";

// Snapshot listeners
function startUsersListener() {
  if (state.usersUnsub) return;
  state.usersUnsub = onSnapshot(
    usersCol,
    (snap) => {
      state.accounts = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
      const cur = state.pageStack[state.pageStack.length - 1];
      if (state.isAdmin) {
        if (cur === "adminViewAccountsPage") renderAllAccounts();
        if (cur === "adminDeleteAccountPage")
          renderSearchableAccountList("adminDeleteListDisplay", "adminListFilterDelete", "confirmDeleteAccount", "delete");
        if (cur === "adminModifyAccountPage")
          renderSearchableAccountList("adminModifyListDisplay", "adminListFilterModify", "adminModifyUserAction", "modify");
        if (cur === "adminSearchNamePage")
          renderSearchableAccountList("adminSearchListDisplay", "adminListFilterSearchName", "adminViewUser", "view");
      }
    },
    (err) => console.error("users onSnapshot error", err)
  );
}

function startRequestsListener() {
  if (state.requestsUnsub) return;
  state.requestsUnsub = onSnapshot(
    requestsCol,
    (snap) => {
      state.requestsCache = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
      if (state.pageStack.includes("requestsPage")) renderRequests();
    },
    (err) => console.error("requests onSnapshot error", err)
  );
}

// Expose everything expected by inline onclicks
const exposed = {
  // Auth & Account
  login,
  signup,
  logout,
  tryBiometricLogin,
  enableBiometricFlow,
  startPinRecovery,
  verifyPinAnswer,
  setNewPin,
  processChangePin,
  processChangeName,
  processChangePhone,
  processChangeAddress,
  processChangeUsername,

  // Navigation/UI
  showPage,
  goBack,
  toggleDarkMode,
  clearInputsInPage,
  updateHeader,
  triggerCardAnimation,

  // Keypad
  showKeypad,
  hideKeypad,
  keypadInput,
  keypadDelete,

  // Transactions
  processWithdraw,
  processDeposit,
  processTransfer,
  processBillPayment,
  loadStatement,
  openStatementReceipt,
  showReceipt,
  calculateWithdrawFee,

  // Goals & funding
  addGoal,
  fundGoal,
  renderGoals,

  // Scheduled
  addScheduledTransfer,
  runOneScheduled,
  deleteScheduled,
  renderScheduled,
  runScheduledForUser,

  // Requests
  sendRequest,
  renderRequests,
  respondRequest,

  // Admin
  adminViewPhoneNumbers,
  adminApplyInterest,
  exportData,
  triggerImport,
  adminSystemReboot,
  adminModifyUserAction,
  confirmDeleteAccount,
  processModifyAccount,
  renderTransactionHistory,
  adminLocationDetail,
  adminViewUser,
  adminViewTransactionChart,
  adminViewLocationsMenu,
  renderAllAccounts,
  renderSearchableAccountList,
  filterAccountList,

  // Rendering helpers / lists
  renderFavorites,
  renderAnalytics,
  renderLeaderboard,
  renderAchievements,
  renderBillers,
  renderAtmCard,

  // Limits/utility
  updateLimitDisplays,
  updateBalance,
  initPinEyeToggles,
  securePinInputs,
  ensureVirtualKeypad,
  attachInactivityListeners,
  resetInactivityTimer,
  clearInactivityTimer,
  clearAllMessages,
  dismissToastByTitle,

  // Notifications
  toggleNotificationPanel,
  handleNotificationClick,
  markAllNotificationsAsRead,
  deleteAllNotifications,
  deleteNotification,
  clearLocalNotificationsView,
  startNotificationsListener,
  ensureNotificationUI,
  updateBellDotPublic,

  // Misc
  showToast,
  logAuditEvent
};

Object.entries(exposed).forEach(([name, fn]) => {
  try {
    window[name] = fn;
  } catch (e) {
    console.warn("Could not attach function to window:", name, e);
  }
});

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
  loadLocallyDeletedIds();
  loadDarkModePreference();
  ensureVirtualKeypad();
  securePinInputs();
  initPinEyeToggles();
  attachInactivityListeners();
  resetInactivityTimer();
  renderBillers();
  ensureNotificationUI();
  startUsersListener();
  startRequestsListener();
  showPage("loginPage", false);
});