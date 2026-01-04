import {
  db,
  getDocs,
  getDoc,
  deleteDoc,
  runTransaction,
  setDoc,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
  limit,
  collection,
  orderBy
} from "./firebase-config.js";
import {
  usersCol,
  transactionsCol,
  requestsCol,
  scheduledCol,
  ACCOUNT_TYPES,
  achievementsCol,
  auditCol,
  ADMIN_USERNAME
} from "./constants.js";
import { state } from "./state.js";
import { showToast, showMessage } from "./toast.js";
import { formatCurrency } from "./utils.js";
import { showPage, clearInputsInPage, clearAllMessages } from "./navigation.js";
import { getVisibleAccounts } from "./transactions.js";
import { generateSalt, hashPin } from "./utils.js";
import { getPinValue } from "./keypad.js";
import { logProfileChange } from "./audit.js";

export async function adminApplyInterest() {
  if (!confirm(`Apply monthly interest per account type? This cannot be undone.`)) return;
  try {
    showToast("Applying interest", "Please wait...", "info");
    const usersSnap = await getDocs(usersCol);
    let totalInterest = 0;
    const batchPromises = usersSnap.docs.map((docSnap) => {
      const acc = { id: docSnap.id, ...docSnap.data() };
      const meta = ACCOUNT_TYPES[acc.accountType] || ACCOUNT_TYPES.savings;
      const interest = acc.balance * meta.interestRate;
      totalInterest += interest;
      return runTransaction(db, async (t) => {
        const uRef = doc(db, "users", acc.id);
        const uSnap = await t.get(uRef);
        if (!uSnap.exists()) return;
        const newBal = (uSnap.data().balance || 0) + interest;
        t.update(uRef, { balance: newBal });
        const txRef = doc(transactionsCol);
        t.set(txRef, {
          type: "INTEREST",
          username: uSnap.data().username,
          userId: uRef.id,
          amount: interest,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toLocaleTimeString(),
          createdAt: serverTimestamp(),
        });
      });
    });
    await Promise.all(batchPromises);
    showToast("Interest applied", `Total interest: ${formatCurrency(totalInterest)}`, "success");
    showPage("adminDashboardPage");
  } catch (err) {
    console.error("Interest error", err);
    showToast("Error", "Failed to apply interest", "error");
  }
}

export async function adminSystemReboot() {
  if (!confirm("WARNING: This will permanently wipe ALL user accounts and transaction data (Firestore). Are you absolutely sure?")) {
    return;
  }
  try {
    showToast("Rebooting", "Removing all documents...", "warning");
    const usersSnap = await getDocs(usersCol);
    const deletePromises = [];
    usersSnap.forEach((d) => deletePromises.push(deleteDoc(doc(db, "users", d.id))));
    const txSnap = await getDocs(transactionsCol);
    txSnap.forEach((d) => deletePromises.push(deleteDoc(doc(db, "transactions", d.id))));
    const reqSnap = await getDocs(requestsCol);
    reqSnap.forEach((d) => deletePromises.push(deleteDoc(doc(db, "requests", d.id))));
    const schedSnap = await getDocs(scheduledCol);
    schedSnap.forEach((d) => deletePromises.push(deleteDoc(doc(db, "scheduled_transfers", d.id))));
    await Promise.all(deletePromises);
    alert("SYSTEM REBOOT SUCCESSFUL: All data cleared. Returning to Login.");
    showPage("loginPage");
  } catch (err) {
    console.error("Reboot failed", err);
    showToast("Error", "System reboot failed", "error");
  }
}

export function renderSearchableAccountList(listElementId, filterInputId, onclickFnName, actionType) {
  const listEl = document.getElementById(listElementId);
  const filterInputEl = document.getElementById(filterInputId);

  const visible = getVisibleAccounts();
  if (visible.length === 0) {
    listEl.innerHTML = '<div class="info-box">No user accounts registered.</div>';
    return;
  }
  let buttonText = "";
  let buttonClass = "";
  if (actionType === "delete") {
    buttonText = "Delete";
    buttonClass = "danger delete";
  } else if (actionType === "view") {
    buttonText = "View";
    buttonClass = "view";
  } else if (actionType === "modify") {
    buttonText = "Modify";
    buttonClass = "modify";
  } else {
    buttonText = "Action";
    buttonClass = "secondary";
  }
  const html = visible
    .map(
      (acc) => `
<div class="admin-account-item-container" data-username="${acc.username.toLowerCase()}" data-name="${acc.fname.toLowerCase()} ${acc.lname.toLowerCase()}">
  <div class="admin-account-item-info">
    <span class="username">${acc.username}</span>
    <span class="name">(${acc.fname} ${acc.lname})</span>
  </div>
  <button class="admin-action-btn ${buttonClass}" onclick="${onclickFnName}('${acc.username}')">${buttonText}</button>
</div>
`
    )
    .join("");
  listEl.innerHTML = html;
  if (filterInputEl && filterInputEl.value) {
    filterAccountList(filterInputId, listElementId);
  }
}

export function filterAccountList(filterInputId, listElementId) {
  const filterValue = document.getElementById(filterInputId).value.toLowerCase();
  const listEl = document.getElementById(listElementId);
  const items = listEl.querySelectorAll(".admin-account-item-container");
  items.forEach((item) => {
    const username = item.getAttribute("data-username");
    const name = item.getAttribute("data-name");
    if (username.includes(filterValue) || name.includes(filterValue)) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

export function renderAllAccounts() {
  const listEl = document.getElementById("adminAccountList");
  const visible = getVisibleAccounts();
  if (visible.length === 0) {
    listEl.innerHTML = '<div class="info-box">No user accounts registered.</div>';
    return;
  }
  const html = visible
    .map(
      (acc) => `
<div class="transaction-item income" style="border-left-color: #6366f1;">
  <div class="transaction-header">${acc.username} (${acc.fname} ${acc.lname})</div>
  <div class="transaction-details">
    Balance: ${formatCurrency(acc.balance)} | Phone: ${acc.phone} | Age: ${acc.age} | Type: ${ACCOUNT_TYPES[acc.accountType]?.label || "Savings"}
  </div>
</div>
`
    )
    .join("");
  listEl.innerHTML = html;
}

export function adminViewUser(username) {
  const acc = state.accounts.find((a) => a.username === username);
  if (!acc) {
    alert(`User ${username} not found!`);
    return;
  }
  document.getElementById("adminViewFullName").textContent = `${acc.fname} ${acc.mname} ${acc.lname}`;
  document.getElementById("adminViewUsername").textContent = acc.username;
  document.getElementById("adminViewBirthday").textContent = acc.birthday;
  document.getElementById("adminViewPhone").textContent = acc.phone;
  document.getElementById("adminViewAddress").textContent = acc.address;
  document.getElementById("adminViewAge").textContent = acc.age;
  document.getElementById("adminViewBalance").textContent = acc.balance.toFixed(2);
  document.getElementById("adminViewType").textContent = ACCOUNT_TYPES[acc.accountType]?.label || "Savings";
  showPage("adminViewUserPage");
}

export function adminModifyUserAction(username) {
  clearAllMessages();
  const userToModify = state.accounts.find((acc) => acc.username === username);
  if (!userToModify) {
    showMessage("adminModifyMessage", `User '${username}' not found.`, "error");
    state.currentModifiedUser = null;
    return;
  }
  if (username === ADMIN_USERNAME) {
    showMessage("adminModifyMessage", "Cannot modify the Admin account.", "error");
    state.currentModifiedUser = null;
    return;
  }
  state.currentModifiedUser = userToModify;
  showPage("adminEditUserPage");
}

export async function confirmDeleteAccount(usernameToDelete) {
  if (!usernameToDelete) {
    showMessage("adminDeleteMessage", "Internal error: Username not provided.", "error");
    return;
  }
  if (usernameToDelete === ADMIN_USERNAME) {
    showMessage("adminDeleteMessage", "Cannot delete the Admin account.", "error");
    return;
  }
  if (!confirm(`Are you sure you want to permanently delete account for ${usernameToDelete}? This cannot be undone.`)) {
    return;
  }

  try {
    const u = state.accounts.find((a) => a.username === usernameToDelete);
    if (!u) {
      showMessage("adminDeleteMessage", `Username ${usernameToDelete} not found.`, "error");
      return;
    }

    const ops = [];

    // Delete user doc
    ops.push(deleteDoc(doc(db, "users", u.id)));

    // Best-effort deletions; ignore failures due to rules/permissions
    const safeDel = (promise) =>
      promise.catch((err) => console.warn("Skip delete (permission/index):", err.message || err));

    const txs = await getDocs(query(transactionsCol, where("userId", "==", u.id)));
    txs.forEach((d) => ops.push(safeDel(deleteDoc(doc(db, "transactions", d.id)))));

    const txs2 = await getDocs(query(transactionsCol, where("recipientId", "==", u.id)));
    txs2.forEach((d) => ops.push(safeDel(deleteDoc(doc(db, "transactions", d.id)))));

    const reqs = await getDocs(query(requestsCol, where("fromId", "==", u.id)));
    reqs.forEach((d) => ops.push(safeDel(deleteDoc(doc(db, "requests", d.id)))));

    const reqs2 = await getDocs(query(requestsCol, where("toId", "==", u.id)));
    reqs2.forEach((d) => ops.push(safeDel(deleteDoc(doc(db, "requests", d.id)))));

    const scheds = await getDocs(query(scheduledCol, where("from", "==", usernameToDelete)));
    scheds.forEach((d) => ops.push(safeDel(deleteDoc(doc(db, "scheduled_transfers", d.id)))));

    await Promise.all(ops);

    showMessage(
      "adminDeleteMessage",
      `Account ${usernameToDelete} deleted. Related logs deleted where permitted.`,
      "success"
    );
    renderSearchableAccountList("adminDeleteListDisplay", "adminListFilterDelete", "confirmDeleteAccount", "delete");
  } catch (err) {
    console.error("Delete account failed", err);
    showMessage(
      "adminDeleteMessage",
      err?.message || "Failed to delete account. Check Firestore rules/indexes.",
      "error"
    );
  }
}

export async function processModifyAccount() {
  if (!state.currentModifiedUser) {
    showMessage("adminEditMessage", "No user loaded for modification.", "error");
    return;
  }

  const newFname = document.getElementById("modifyFname").value.trim();
  const newLname = document.getElementById("modifyLname").value.trim();
  const newBalance = parseFloat(document.getElementById("modifyBalance").value);
  const newPhoneRaw = document.getElementById("modifyPhone").value.trim();
  const { sanitizePhone, validatePhone } = await import("./utils.js");
  const newPhone = sanitizePhone(newPhoneRaw);
  const adminNewPin = getPinValue("adminModifyNewPin");
  const adminConfirmPin = getPinValue("adminModifyConfirmPin");
  const newType = document.getElementById("modifyAccountType").value || "savings";

  if (!newFname || !newLname || isNaN(newBalance) || !newPhone) {
    showMessage("adminEditMessage", "All mandatory fields (Name, Balance, Phone) are required and balance must be a number.", "error");
    return;
  }
  if (!validatePhone(newPhone)) {
    showMessage("adminEditMessage", "Phone must be 10-15 digits.", "error");
    return;
  }

  try {
    const updates = {
      fname: newFname,
      lname: newLname,
      balance: newBalance,
      phone: newPhone,
      accountType: newType
    };
    const before = { ...state.currentModifiedUser };
    if (adminNewPin) {
      if (adminNewPin !== adminConfirmPin) {
        showMessage("adminEditMessage", "New PINs do not match.", "error");
        return;
      }
      if (adminNewPin.length < 4 || adminNewPin.length > 6 || !/^\d+$/.test(adminNewPin)) {
        showMessage("adminEditMessage", "New PIN must be 4-6 digits.", "error");
        return;
      }
      const newSalt = generateSalt();
      const hashed = await hashPin(adminNewPin, newSalt);
      updates.pin_hash = hashed;
      updates.pin_salt = newSalt;
      const adminNewPinEl = document.getElementById("adminModifyNewPin");
      if (adminNewPinEl) { adminNewPinEl.value = ''; adminNewPinEl.removeAttribute("data-pin-value"); }
      const adminConfirmPinEl = document.getElementById("adminModifyConfirmPin");
      if (adminConfirmPinEl) { adminConfirmPinEl.value = ''; adminConfirmPinEl.removeAttribute("data-pin-value"); }
    }
    await updateDoc(doc(db, "users", state.currentModifiedUser.id), updates);
    await logProfileChange("ADMIN_MODIFY_ACCOUNT", before, { ...before, ...updates });

    const modifiedUsername = state.currentModifiedUser.username;
    state.currentModifiedUser = null;
    showMessage("adminEditMessage", `Account ${modifiedUsername} updated successfully by Admin.`, "success");
    showToast("Admin update", `Account ${modifiedUsername} updated.`, "success");
    clearInputsInPage("adminEditUserPage");
    setTimeout(() => showPage("adminModifyAccountPage"), 1500);
  } catch (err) {
    console.error("Admin modify failed", err);
    showMessage("adminEditMessage", "Failed to update account", "error");
  }
}

export async function adminTransactionHistory(type) {
  showPage("adminTransactionHistoryPage");
  const listEl = document.getElementById("adminHistoryList");
  const titleEl = document.getElementById("adminHistoryTitle");

  const renderItems = (items) => {
    if (!items || items.length === 0) {
      listEl.innerHTML = '<div class="info-box">No transactions found.</div>';
      return;
    }
    const html = items.map((t) => {
      if (type === "withdraw") {
        const amountDisplay = formatCurrency(t.amount) + (t.fee ? ` (Fee: ${formatCurrency(t.fee)})` : '');
        return `<div class="transaction-item expense">
<div style="display: flex; justify-content: space-between; font-size: 13px;">
<span style="flex: 1; min-width: 80px; font-weight: 600;">${t.username}</span>
<span style="flex: 1.5;">${amountDisplay}</span>
<span style="flex: 1; color: #666;">${t.date || ''}</span>
<span style="flex: 0.5; color: #666;">${t.time || ''}</span>
</div>
</div>`;
      } else if (type === "deposit") {
        return `<div class="transaction-item income">
<div style="display: flex; justify-content: space-between; font-size: 13px;">
<span style="flex: 1; min-width: 80px; font-weight: 600;">${t.username}</span>
<span style="flex: 1.5;">${formatCurrency(t.amount)}</span>
<span style="flex: 1; color: #666;">${t.date || ''}</span>
<span style="flex: 0.5; color: #666;">${t.time || ''}</span>
</div>
</div>`;
      } else if (type === "transfer") {
        return `<div class="transaction-item" style="border-left-color: #764ba2;">
<div style="display: flex; justify-content: space-between; font-size: 13px;">
<span style="flex: 1; min-width: 80px; font-weight: 600;">${t.username}</span>
<span style="flex: 1; min-width: 80px;">${t.recipient || ''}</span>
<span style="flex: 1.5;">${formatCurrency(t.amount)}</span>
<span style="flex: 1; color: #666;">${t.date || ''}</span>
</div>
</div>`;
      } else {
        return `<div class="transaction-item expense">
<div style="display:flex; justify-content:space-between; font-size:13px;">
<span style="flex:1; font-weight:600;">${t.username}</span>
<span style="flex:1;">${t.billerName || "Unknown"}</span>
<span style="flex:1;">${formatCurrency(t.amount)}</span>
<span style="flex:1; color:#666;">${t.date || ""}</span>
</div>
</div>`;
      }
    }).join("");
    listEl.innerHTML = html;
  };

  try {
    let q = null;
    let title = "";
    if (type === "withdraw") {
      q = query(transactionsCol, where("type", "==", "WITHDRAWAL"), orderBy("date"));
      title = "All Withdrawal History";
    } else if (type === "deposit") {
      q = query(transactionsCol, where("type", "==", "DEPOSIT"), orderBy("date"));
      title = "All Deposit History";
    } else if (type === "transfer") {
      q = query(transactionsCol, where("type", "==", "TRANSFER"), orderBy("date"));
      title = "All Transfer History";
    } else {
      q = query(transactionsCol, where("type", "==", "BILL_PAYMENT"), orderBy("date"));
      title = "All Bill Payment History";
    }
    titleEl.textContent = title;
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    renderItems(items);
  } catch (err) {
    console.warn("Indexed admin history query failed, falling back to client-side sort:", err);
    try {
      let q = null;
      let title = "";
      if (type === "withdraw") {
        q = query(transactionsCol, where("type", "==", "WITHDRAWAL"));
        title = "All Withdrawal History";
      } else if (type === "deposit") {
        q = query(transactionsCol, where("type", "==", "DEPOSIT"));
        title = "All Deposit History";
      } else if (type === "transfer") {
        q = query(transactionsCol, where("type", "==", "TRANSFER"));
        title = "All Transfer History";
      } else {
        q = query(transactionsCol, where("type", "==", "BILL_PAYMENT"));
        title = "All Bill Payment History";
      }
      titleEl.textContent = title;
      const snap = await getDocs(q);
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const ka = a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : a.date || "";
        const kb = b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : b.date || "";
        if (typeof ka === "number" && typeof kb === "number") return kb - ka;
        if (ka < kb) return 1;
        if (ka > kb) return -1;
        return 0;
      });
      renderItems(items);
      showToast("Notice", "History loaded via fallback (no index). Consider adding the missing index for better performance.", "warning");
    } catch (innerErr) {
      console.error("Fallback admin history load failed", innerErr);
      listEl.innerHTML = '<div class="info-box">Failed to load history.</div>';
    }
  }
}
export function renderTransactionHistory(type) {
  setTimeout(() => adminTransactionHistory(type), 50);
}

export function normalizeAddress(address) {
  if (!address) return "";
  return address.toLowerCase().replace(/[\s,.'"]/g, "");
}
export function buildAddressIndex() {
  const addressMap = {};
  const visible = getVisibleAccounts();
  for (const account of visible) {
    if (!account.address) continue;
    const normalized = normalizeAddress(account.address);
    if (normalized) {
      if (!addressMap[normalized]) {
        addressMap[normalized] = [];
      }
      addressMap[normalized].push(account.username);
    }
  }
  return addressMap;
}
export function adminViewLocationsMenu() {
  const addressMap = buildAddressIndex();
  const listEl = document.getElementById("adminLocationsList");
  const msgEl = document.getElementById("locationsMessage");
  if (msgEl) msgEl.style.display = "none";
  if (Object.keys(addressMap).length === 0) {
    listEl.innerHTML = '<div class="info-box">No user addresses found.</div>';
    return;
  }
  const buttonsHTML = Object.entries(addressMap).map(([normalizedAddress, users]) => {
    const firstUser = state.accounts.find((acc) => normalizeAddress(acc.address) === normalizedAddress);
    const displayAddress = firstUser ? firstUser.address : normalizedAddress;
    const escapedAddress = normalizedAddress.replace(/'/g, "\\'");
    return `<button class="menu-btn" style="--icon:url('https://img.icons8.com/ios-filled/100/marker.png')" onclick="adminLocationDetail('${escapedAddress}')">
<span class="label">${displayAddress}</span>
<span class="sub">${users.length} users</span>
</button>`;
  }).join("");
  listEl.innerHTML = buttonsHTML;
}
export function adminLocationDetail(normalizedAddress) {
  showPage("adminLocationDetailPage");
  const usersInLocationUsernames = buildAddressIndex()[normalizedAddress] || [];
  const listEl = document.getElementById("adminLocationUserList");
  const firstUser = state.accounts.find((acc) => normalizeAddress(acc.address) === normalizedAddress);
  const displayAddress = firstUser ? firstUser.address : normalizedAddress;
  const addrEl = document.getElementById("locationDetailAddress");
  if (addrEl) addrEl.textContent = displayAddress;
  if (usersInLocationUsernames.length === 0) {
    listEl.innerHTML = '<div class="info-box">No users found at this location.</div>';
    return;
  }
  let maxBalance = -1;
  let richestUser = null;
  const usersInLocationAccounts = usersInLocationUsernames
    .map((username) => state.accounts.find((a) => a.username === username))
    .filter((a) => a);
  for (const acc of usersInLocationAccounts) {
    if (acc.balance > maxBalance) {
      maxBalance = acc.balance;
    }
  }
  richestUser = usersInLocationAccounts.find((acc) => acc.balance === maxBalance)?.username || null;
  const header = `<div style="font-weight: 600; padding: 10px 0; display: flex; border-bottom: 2px solid #ddd; margin-bottom: 10px;">
<span style="flex: 3; min-width: 150px;">FULL NAME</span>
<span style="flex: 1;">AGE </span>
<span style="flex: 2;">BALANCE</span>
</div>`;
  const rowsHTML = usersInLocationAccounts
    .map((acc) => {
      const fullName = `${acc.fname} ${acc.lname}`;
      const crown = (acc.username === richestUser) ? " 👑" : "";
      return `<div class="transaction-item" style="border-left-color: #48bb78; display: flex; font-size: 14px;">
<span style="flex: 3; min-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fullName + crown}</span>
<span style="flex: 1; color: #666;">${acc.age}</span>
<span style="flex: 2; font-weight: 600;">${formatCurrency(acc.balance)}</span>
</div>`;
    })
    .join("");
  listEl.innerHTML = header + rowsHTML;
}

export async function exportData() {
  try {
    showToast("Exporting", "Preparing data...", "info");
    const usersSnap = await getDocs(usersCol);
    const txSnap = await getDocs(transactionsCol);
    const reqSnap = await getDocs(requestsCol);
    const schedSnap = await getDocs(scheduledCol);
    const achievementsSnap = await getDocs(achievementsCol);
    const auditSnap = await getDocs(auditCol);

    const payload = {
      accounts: usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      transactions: txSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      requests: reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      scheduledTransfers: schedSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      achievements: achievementsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      auditLog: auditSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atm-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage("adminDataMessage", "Backup exported successfully.", "success");
  } catch (err) {
    console.error("Export failed", err);
    showMessage("adminDataMessage", "Failed to export backup.", "error");
  }
}

export function triggerImport() {
  const input = document.getElementById("adminImportInput");
  if (input) input.click();
}

export function handleImportFile(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
        showMessage("adminDataMessage", "Invalid backup format.", "error");
        return;
      }
      showMessage("adminDataMessage", "Importing backup... this may take a while (client-side).", "info");
      const ops = [];
      for (const u of data.accounts) {
        const r = doc(usersCol);
        ops.push(setDoc(r, u));
      }
      for (const t of data.transactions) {
        const r = doc(transactionsCol);
        ops.push(setDoc(r, t));
      }
      await Promise.all(ops);
      showMessage("adminDataMessage", "Backup imported. Reloading...", "success");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      showMessage("adminDataMessage", "Failed to import backup.", "error");
    }
  };
  reader.readAsText(file);
  evt.target.value = "";
}

export function adminViewPhoneNumbers() {
  showPage("adminViewPhoneNumbersPage");
  const listEl = document.getElementById("adminPhoneList");
  const visible = getVisibleAccounts();
  if (!visible || visible.length === 0) {
    listEl.innerHTML = '<div class="info-box">No registered accounts found.</div>';
    return;
  }
  const html = visible
    .map(
      (acc) => `
<div class="transaction-item">
  <div class="transaction-header">${acc.fname} ${acc.lname}</div>
  <div class="transaction-details">
    <span style="color: var(--coral);">Username:</span> ${acc.username} <br>
    <span style="color: #ccc;">Phone:</span> ${acc.phone || "N/A"}
  </div>
</div>
`
    )
    .join("");
  listEl.innerHTML = html;
}

export async function adminViewTransactionChart() {
  showPage("adminViewTransactionChartPage");

  const statsEl = document.getElementById("chartStats");
  const chartEl = document.getElementById("systemBarChart");

  if (!statsEl || !chartEl) {
    console.warn("adminViewTransactionChart: required DOM elements not found");
    return;
  }

  try {
    const txSnap = await getDocs(transactionsCol);
    const usersSnap = await getDocs(usersCol);

    let totalDeposit = 0;
    let totalWithdrawal = 0;
    let totalTransfer = 0;
    let totalBills = 0;
    let totalFees = 0;

    txSnap.forEach((d) => {
      const t = d.data();
      const type = (t.type || "").toUpperCase();
      const amt = Number(t.amount || 0);
      const fee = Number(t.fee || 0);
      if (type === "DEPOSIT") totalDeposit += amt;
      else if (type === "WITHDRAWAL") {
        totalWithdrawal += amt;
        totalFees += fee;
      } else if (type === "TRANSFER") totalTransfer += amt;
      else if (type === "BILL_PAYMENT" || type === "BILL PAYMENT") totalBills += amt;
      else if (type === "INTEREST") {
        totalDeposit += amt;
      }
    });

    const totalUsers = usersSnap.size;
    const totalBalance = usersSnap.docs.reduce((sum, d) => sum + (Number(d.data().balance || 0)), 0);

    const chartData = [
      { title: "Deposits", amount: totalDeposit, class: "deposit" },
      { title: "Withdrawals", amount: totalWithdrawal, class: "withdrawal" },
      { title: "Transfers", amount: totalTransfer, class: "transfer" },
      { title: "Bill Pay", amount: totalBills, class: "withdrawal" },
    ];
    const maxAmount = Math.max(...chartData.map((c) => c.amount), 1);
    const chartHTML = chartData
      .map((data) => {
        const percentage = (data.amount / maxAmount) * 100;
        const barHeight = Math.max(percentage, 2);
        return `
<div class="chart-bar-container" title="${data.title}: ${formatCurrency(data.amount)}">
  <div class="chart-bar ${data.class}" style="height: ${barHeight}%">
    <span class="bar-value">${formatCurrency(data.amount)}</span>
  </div>
  <div class="chart-bar-label">${data.title}</div>
</div>
`;
      })
      .join("");
    chartEl.innerHTML = chartHTML;

    const stats = [
      { title: "Total Users", value: totalUsers, color: "#d4af37" },
      { title: "Total System Balance", value: formatCurrency(totalBalance), color: "#34d399" },
      { title: "Total Deposits", value: formatCurrency(totalDeposit), color: "#34d399" },
      { title: "Total Withdrawals", value: formatCurrency(totalWithdrawal), color: "#ef4444" },
      { title: "Total Transfers", value: formatCurrency(totalTransfer), color: "#8b5cf6" },
      { title: "Total Bill Pay", value: formatCurrency(totalBills), color: "#f59e0b" },
      { title: "Total Fees Collected", value: formatCurrency(totalFees), color: "#f59e0b" },
    ];
    const html = stats
      .map(
        (stat) => `
<div class="stat-card" style="border-color: ${stat.color};">
  <div style="color: #dcdcdc; font-size: 13px;">${stat.title}</div>
  <div class="value" style="color: ${stat.color};">${stat.value}</div>
</div>
`
      )
      .join("");
    statsEl.innerHTML = html;
  } catch (err) {
    console.error("adminViewTransactionChart error", err);
    showToast("Error", "Failed to load system summary", "error");
    statsEl.innerHTML = '<div class="info-box">Failed to load system summary.</div>';
    chartEl.innerHTML = "";
  }
}