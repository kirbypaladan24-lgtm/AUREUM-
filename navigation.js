import { state } from "./state.js";
import { ACCOUNT_TYPES } from "./constants.js";
import { formatCardNumber, generateCardNumberFromUsername } from "./utils.js";
import { renderFavorites, renderBillers, loadStatement, calculateWithdrawFee } from "./transactions.js";
import { renderScheduled } from "./scheduled.js";
import { renderRequests } from "./requests.js";
import { renderGoals } from "./goals.js";
import { renderAchievements } from "./achievements.js";
import { renderAnalytics, renderLeaderboard } from "./analytics.js";
import { renderAllAccounts, renderSearchableAccountList, adminViewLocationsMenu } from "./admin.js";
import { updateLimitDisplays } from "./limits.js";
import { renderNotificationsPage, renderNotificationPanel, ensureNotificationUI } from "./notifications.js";
import { resetInactivityTimer } from "./inactivity.js";
import { hideKeypad } from "./keypad.js";

export function clearInputsInPage(pageId) {
  const page = document.getElementById(pageId);
  if (!page) return;
  page.querySelectorAll('input, textarea').forEach(el => {
    if (el.type === 'button' || el.type === 'submit') return;
    el.value = '';
    if (el.hasAttribute('data-pin-value')) el.removeAttribute('data-pin-value');
  });
  if (pageId === 'withdrawPage') {
    const ws = document.getElementById('withdrawSummary');
    if (ws) ws.style.display = 'none';
  }
  if (pageId === 'transferPage') {
    const info = document.getElementById('transferRecipientInfo');
    if (info) info.style.display = 'none';
  }
}

export function clearAllMessages() {
  const ids = [
    'loginMessage', 'signupMessage', 'withdrawMessage', 'depositMessage', 'transferMessage',
    'changePinMessage', 'changeNameMessage', 'changePhoneMessage', 'changeAddressMessage', 'changeUsernameMessage',
    'adminDeleteMessage', 'adminModifyMessage', 'adminSearchMessage', 'adminEditMessage',
    'optionsMessage', 'adminOptionsMessage', 'pinRecoveryMessage', 'adminDataMessage',
    'goalsMessage', 'scheduledMessage', 'requestsMessage', 'billPayMessage'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

export function updateHeader(pageId) {
  const backBtn = document.getElementById('backBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const mainContainer = document.getElementById('mainContainer');

  const fullScreenPages = [
    'dashboardPage', 'adminDashboardPage', 'adminViewAccountsPage',
    'adminDeleteAccountPage', 'adminModifyAccountPage', 'adminViewTransactionChartPage',
    'adminTransactionHistoryPage', 'adminViewPhoneNumbersPage', 'adminSearchNamePage',
    'adminTransactionHistoryMenu', 'adminViewLocationsMenuPage', 'adminLocationDetailPage',
    'adminViewUserPage', 'adminEditUserPage',
    'viewAccountPage', 'statementPage', 'settingsPage', 'receiptPage',
    'goalsPage', 'analyticsPage', 'leaderboardPage', 'scheduledPage',
    'requestsPage', 'achievementsPage', 'billPayPage', 'notificationsPage'
  ];
  if (fullScreenPages.includes(pageId)) mainContainer?.classList.add('full-screen');
  else mainContainer?.classList.remove('full-screen');

  const isRoot = pageId === 'loginPage';
  const isDash = pageId === 'dashboardPage' || pageId === 'adminDashboardPage';
  if (backBtn) backBtn.style.display = (isRoot || isDash || state.pageStack.length <= 1) ? 'none' : 'flex';
  if (logoutBtn) logoutBtn.style.display = isDash ? 'flex' : 'none';

  const titles = {
    'loginPage': 'AUREUM BANK',
    'signupPage': 'Create Account',
    'forgotPinPage': 'PIN Recovery',
    'dashboardPage': `Welcome, ${state.currentUser ? state.currentUser.fname : 'User'}!`,
    'adminDashboardPage': 'Admin Panel',
    'adminViewAccountsPage': 'All Accounts',
    'adminDeleteAccountPage': 'Delete User',
    'adminModifyAccountPage': 'Modify User',
    'adminEditUserPage': 'Edit Account',
    'adminViewPhoneNumbersPage': 'Phone Numbers',
    'adminSearchNamePage': 'Search User',
    'adminViewTransactionChartPage': 'System Chart',
    'adminViewLocationsMenuPage': 'Locations',
    'adminLocationDetailPage': 'Location Detail',
    'adminViewUserPage': 'User Details',
    'adminTransactionHistoryMenu': 'Reports',
    'adminTransactionHistoryPage': 'History',
    'viewAccountPage': 'Account Info',
    'withdrawPage': 'Withdrawal',
    'depositPage': 'Deposit',
    'transferPage': 'Transfer',
    'billPayPage': 'Bill Payment',
    'settingsPage': 'Settings',
    'changePinPage': 'Change PIN',
    'changeNamePage': 'Change Name',
    'changePhonePage': 'Change Phone',
    'changeAddressPage': 'Change Address',
    'changeUsernamePage': 'Change Username',
    'statementPage': 'Statement',
    'receiptPage': 'Receipt',
    'goalsPage': 'Savings Goals',
    'analyticsPage': 'Analytics',
    'leaderboardPage': 'Leaderboard',
    'scheduledPage': 'Scheduled',
    'requestsPage': 'Requests',
    'achievementsPage': 'Achievements',
    'notificationsPage': 'Notifications'
  };

  if (pageTitle) pageTitle.textContent = titles[pageId] || 'AUREUM BANK';
  if (pageSubtitle) pageSubtitle.textContent = state.isAdmin ? 'System Administration' : (state.currentUser ? 'Banking Services' : 'Secure Banking Experience');
}

export function loadPageData(pageId) {
  if (pageId === 'dashboardPage' && state.currentUser) {
    const userGreeting = document.getElementById('userGreeting');
    const dashboardUsername = document.getElementById('dashboardUsername');
    if (userGreeting) userGreeting.textContent = state.currentUser.fname;
    if (dashboardUsername) dashboardUsername.textContent = state.currentUser.username;
    updateBalance();
    renderAtmCard('dashboard');
    renderFavorites();
    ensureNotificationUI();
    renderNotificationPanel();
  } else if (pageId === 'viewAccountPage' && state.currentUser) {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('viewAccountFullName', `${state.currentUser.fname} ${state.currentUser.mname} ${state.currentUser.lname}`);
    setText('viewAccountUsername', state.currentUser.username);
    setText('viewAccountBirthday', state.currentUser.birthday);
    setText('viewAccountPhone', state.currentUser.phone);
    setText('viewAccountAddress', state.currentUser.address);
    setText('viewAccountAge', state.currentUser.age);
    setText('viewAccountBalance', (state.currentUser.balance || 0).toFixed(2));
    setText('viewAccountType', ACCOUNT_TYPES[state.currentUser.accountType]?.label || 'Savings');
    renderAtmCard('view');
  } else if (pageId === 'adminViewAccountsPage' && state.isAdmin) {
    renderAllAccounts();
  } else if (pageId === 'adminDeleteAccountPage' && state.isAdmin) {
    renderSearchableAccountList('adminDeleteListDisplay', 'adminListFilterDelete', 'confirmDeleteAccount', 'delete');
  } else if (pageId === 'adminModifyAccountPage' && state.isAdmin) {
    renderSearchableAccountList('adminModifyListDisplay', 'adminListFilterModify', 'adminModifyUserAction', 'modify');
  } else if (pageId === 'adminEditUserPage' && state.isAdmin && state.currentModifiedUser) {
    const modDisplay = document.getElementById('modifiedUsernameDisplay');
    if (modDisplay) modDisplay.textContent = state.currentModifiedUser.username;
    const mf = document.getElementById('modifyFname'); if (mf) mf.value = state.currentModifiedUser.fname;
    const ml = document.getElementById('modifyLname'); if (ml) ml.value = state.currentModifiedUser.lname;
    const mb = document.getElementById('modifyBalance'); if (mb) mb.value = (state.currentModifiedUser.balance || 0).toFixed(2);
    const mp = document.getElementById('modifyPhone'); if (mp) mp.value = state.currentModifiedUser.phone;
    const mat = document.getElementById('modifyAccountType'); if (mat) mat.value = state.currentModifiedUser.accountType || 'savings';
    const anp = document.getElementById('adminModifyNewPin'); if (anp) { anp.value = ''; anp.removeAttribute('data-pin-value'); }
    const acp = document.getElementById('adminModifyConfirmPin'); if (acp) { acp.value = ''; acp.removeAttribute('data-pin-value'); }
    const editMsg = document.getElementById('adminEditMessage'); if (editMsg) editMsg.innerHTML = '';
  } else if (pageId === 'adminSearchNamePage' && state.isAdmin) {
    renderSearchableAccountList('adminSearchListDisplay', 'adminListFilterSearchName', 'adminViewUser', 'view');
  } else if (pageId === 'adminViewLocationsMenuPage' && state.isAdmin) {
    adminViewLocationsMenu();
  } else if (pageId === 'changeNamePage' && state.currentUser) {
    const fn = document.getElementById('changeNameFname'); if (fn) fn.value = state.currentUser.fname;
    const mn = document.getElementById('changeNameMname'); if (mn) mn.value = state.currentUser.mname;
    const ln = document.getElementById('changeNameLname'); if (ln) ln.value = state.currentUser.lname;
  } else if (pageId === 'changePhonePage' && state.currentUser) {
    const el = document.getElementById('changePhoneNew'); if (el) el.value = state.currentUser.phone;
  } else if (pageId === 'changeAddressPage' && state.currentUser) {
    const el = document.getElementById('changeAddressNew'); if (el) el.value = state.currentUser.address;
  } else if (pageId === 'statementPage' && state.currentUser) {
    loadStatement();
  } else if (pageId === 'changePinPage' && state.currentUser) {
    const oldEl = document.getElementById('changePinOld'); if (oldEl) { oldEl.value = ''; oldEl.removeAttribute('data-pin-value'); }
    const newEl = document.getElementById('changePinNew'); if (newEl) { newEl.value = ''; newEl.removeAttribute('data-pin-value'); }
    const confEl = document.getElementById('changePinConfirm'); if (confEl) { confEl.value = ''; confEl.removeAttribute('data-pin-value'); }
  } else if (pageId === 'forgotPinPage') {
    const s1 = document.getElementById('recoveryStep1'); const s2 = document.getElementById('recoveryStep2'); const s3 = document.getElementById('recoveryStep3');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    if (s3) s3.style.display = 'none';
    const ru = document.getElementById('recoveryUsername'); if (ru) ru.value = '';
    const sa = document.getElementById('securityAnswerInput'); if (sa) sa.value = '';
    const rnp = document.getElementById('recoveryNewPin'); if (rnp) { rnp.value = ''; rnp.removeAttribute('data-pin-value'); }
    const rcp = document.getElementById('recoveryConfirmPin'); if (rcp) { rcp.value = ''; rcp.removeAttribute('data-pin-value'); }
  } else if (pageId === 'goalsPage') {
    renderGoals();
  } else if (pageId === 'analyticsPage') {
    renderAnalytics();
  } else if (pageId === 'leaderboardPage') {
    renderLeaderboard();
  } else if (pageId === 'scheduledPage') {
    renderScheduled();
  } else if (pageId === 'requestsPage') {
    renderRequests();
  } else if (pageId === 'achievementsPage') {
    renderAchievements();
  } else if (pageId === 'transferPage') {
    renderFavorites();
    updateLimitDisplays();
  } else if (pageId === 'withdrawPage') {
    updateLimitDisplays();
    calculateWithdrawFee();
  } else if (pageId === 'billPayPage') {
    renderBillers();
    updateLimitDisplays();
  } else if (pageId === 'notificationsPage') {
    renderNotificationsPage();
  }
}

export function showPage(pageId, updateStack = true) {
  const rootPages = ['dashboardPage', 'adminDashboardPage', 'loginPage'];
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  hideKeypad();

  if (updateStack) {
    const top = state.pageStack[state.pageStack.length - 1];
    if (rootPages.includes(pageId)) {
      state.pageStack.length = 0;
      state.pageStack.push(pageId);
    } else {
      if (top !== pageId) {
        const existingIndex = state.pageStack.indexOf(pageId);
        if (existingIndex >= 0) {
          state.pageStack.splice(existingIndex + 1);
        } else {
          state.pageStack.push(pageId);
        }
      }
    }
  }

  updateHeader(pageId);
  clearAllMessages();
  loadPageData(pageId);
  resetInactivityTimer();
}

export function goBack() {
  if (state.pageStack.length > 1) {
    const currentPage = state.pageStack[state.pageStack.length - 1];
    clearInputsInPage(currentPage);
    state.pageStack.pop();
    const previousPage = state.pageStack[state.pageStack.length - 1];
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const prevEl = document.getElementById(previousPage);
    if (prevEl) prevEl.classList.add('active');
    updateHeader(previousPage);
    clearAllMessages();
    loadPageData(previousPage);
    resetInactivityTimer();
    return;
  }
  if (state.pageStack.length === 1) {
    const only = state.pageStack[0];
    if (only === 'loginPage') return;
    showPage('dashboardPage');
  } else {
    showPage('dashboardPage');
  }
  resetInactivityTimer();
}

export function updateBalance() {
  if (state.currentUser) {
    const balance = (state.currentUser.balance || 0).toFixed(2);
    const dbal = document.getElementById('dashboardBalance');
    const dbal2 = document.getElementById('dashboardBalanceDisplay');
    if (dbal) dbal.textContent = `₱${balance}`;
    if (dbal2) dbal2.textContent = `₱${balance}`;
  }
}

function ensureCardNumber(acc) {
  if (!acc.cardNumber) {
    acc.cardNumber = generateCardNumberFromUsername(acc.username);
  }
}

export function renderAtmCard(context) {
  if (!state.currentUser) return;
  ensureCardNumber(state.currentUser);
  const name = `${state.currentUser.fname || ''} ${state.currentUser.lname || ''}`.trim().toUpperCase() || 'CARDHOLDER';
  const bal = `PHP ${state.currentUser.balance.toFixed(2)}`;
  const numFmt = formatCardNumber(state.currentUser.cardNumber);
  const map = {
    dashboard: { num: '#cardNumberDisplay', name: '#cardNameDisplay', cur: '#cardCurrencyDisplay', bal: '#cardBalanceDisplay' },
    view: { num: '#cardNumberDisplayView', name: '#cardNameDisplayView', cur: '#cardCurrencyDisplayView', bal: '#cardBalanceDisplayView' }
  }[context];
  if (!map) return;
  const set = (sel, val) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  };
  set(map.num, numFmt);
  set(map.name, name);
  set(map.cur, 'PHP');
  set(map.bal, bal);
}

export function triggerCardAnimation() {
  const cards = document.querySelectorAll('.atm-card');
  cards.forEach((card) => {
    const holder = card.closest('.account-info');
    card.classList.remove('card-animating');
    if (holder) holder.classList.remove('card-animating-shadow');
    requestAnimationFrame(() => {
      void card.offsetWidth;
      if (holder) holder.classList.add('card-animating-shadow');
      card.classList.add('card-animating');
      card.addEventListener('animationend', () => {
        card.classList.remove('card-animating');
        if (holder) holder.classList.remove('card-animating-shadow');
      }, { once: true });
    });
  });
}

export function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
  const dm = document.getElementById('darkModeToggle');
  if (dm) dm.textContent = isDark ? '☀︎' : '☽';
  triggerCardAnimation();
  if (state.pageStack.length > 0) {
    loadPageData(state.pageStack[state.pageStack.length - 1]);
  }
}

export function loadDarkModePreference() {
  const preference = localStorage.getItem('darkMode');
  const dm = document.getElementById('darkModeToggle');
  if (preference === 'enabled') {
    document.body.classList.add('dark-mode');
    if (dm) dm.textContent = '☀︎';
  } else {
    if (dm) dm.textContent = '☽';
  }
}