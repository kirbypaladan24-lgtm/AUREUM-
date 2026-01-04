import {
  db,
  auth,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  signInWithEmailAndPassword
} from "./firebase-config.js";
import { state } from "./state.js";
import { showMessage, showToast, dismissToastByTitle } from "./toast.js";
import {
  usersCol,
  ADMIN_USERNAME,
  ADMIN_PIN,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MS
} from "./constants.js";
import {
  hashPin,
  generateSalt,
  sanitizePhone,
  validatePhone,
  validateBirthday,
  generateCardNumberFromUsername
} from "./utils.js";
import { getPinValue, hideKeypad } from "./keypad.js";
import { ensureLimitStructures } from "./limits.js";
import { updateBalance, renderAtmCard, updateHeader, loadPageData, showPage } from "./navigation.js";
import {
  ensureNotificationUI,
  startNotificationsListener,
  deliverPendingNotificationsForUser
} from "./notifications.js";
import { logAuditEvent, logProfileChange } from "./audit.js";
import { evaluateAchievements } from "./achievements.js";
import { runScheduledForUser } from "./scheduled.js";
import { renderFavorites } from "./transactions.js";
import { maybeCreateBirthdayNotification } from "./birthday.js";
import { clearInactivityTimer } from "./inactivity.js";

/* ---------------- Login attempt lockout ---------------- */
function lockoutInfo(username) {
  if (!window.__loginAttempts) window.__loginAttempts = {};
  const record = window.__loginAttempts[username];
  if (!record) return { locked: false };
  if (record.attempts >= LOGIN_MAX_ATTEMPTS && Date.now() - record.lastAttempt < LOGIN_LOCKOUT_MS) {
    const remaining = LOGIN_LOCKOUT_MS - (Date.now() - record.lastAttempt);
    return { locked: true, remaining };
  }
  if (record.attempts >= LOGIN_MAX_ATTEMPTS) {
    window.__loginAttempts[username] = { attempts: 0, lastAttempt: 0 };
  }
  return { locked: false };
}
function registerLoginAttempt(username) {
  if (!window.__loginAttempts) window.__loginAttempts = {};
  const rec = window.__loginAttempts[username] || { attempts: 0, lastAttempt: 0 };
  rec.attempts += 1;
  rec.lastAttempt = Date.now();
  window.__loginAttempts[username] = rec;
  if (rec.attempts >= LOGIN_MAX_ATTEMPTS) {
    showToast("Account Locked", "Too many failed attempts. Please wait 15 minutes.", "error");
  }
}

/* ---------------- Firestore fetch helper ---------------- */
export async function fetchUserByUsername(username) {
  const q = query(usersCol, where("username", "==", username), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ref: d.ref, ...d.data() };
}

/* ---------------- Realtime listener for current user ---------------- */
export async function attachCurrentUserListener(docId) {
  if (state.currentUserUnsub) {
    try {
      state.currentUserUnsub();
    } catch {}
    state.currentUserUnsub = null;
  }
  const ref = doc(usersCol, docId);
  state.currentUserUnsub = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        showToast("Account removed", "Your account was deleted", "warning");
        logout();
        return;
      }
      state.currentUser = { id: snap.id, ref: snap.ref, ...snap.data() };
      ensureLimitStructures(state.currentUser);
      updateBalance();
      renderAtmCard("dashboard");
      renderFavorites();

      try {
        const currentPage = state.pageStack[state.pageStack.length - 1];
        if (currentPage) {
          updateHeader(currentPage);
          loadPageData(currentPage);
        }
      } catch (e) {
        console.warn("Error updating UI after user snapshot", e);
      }

      try {
        ensureNotificationUI();
        startNotificationsListener(state.currentUser.username);
      } catch (e) {
        console.warn("Notification UI init failed", e);
      }

      try {
        if (state.currentUser.username) {
          deliverPendingNotificationsForUser(state.currentUser.username).catch((e) =>
            console.warn("Deliver notifications error", e)
          );
        }
      } catch (e) {}

      try {
        maybeCreateBirthdayNotification(state.currentUser);
      } catch (e) {}
    },
    (err) => console.error("user onSnapshot error", err)
  );
}

/* ---------------- Honeypot & ban UI helpers ---------------- */
function renderTakeover(message, redirectUrl) {
  try {
    document.body.innerHTML = "";
    document.body.style.background = "black";
    document.body.style.margin = "0";
    document.body.style.height = "100vh";
    document.body.style.display = "flex";
    document.body.style.alignItems = "center";
    document.body.style.justifyContent = "center";

    const container = document.createElement("div");
    Object.assign(container.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "18px",
      textAlign: "center",
      color: "#fff",
      padding: "20px",
      maxWidth: "900px",
      width: "100%"
    });

    const img = document.createElement("img");
    img.src = "https://media.tenor.com/KEzW7ALjUkoAAAAM/clown-mirror.gif";
    img.alt = "Clown Mirror";
    img.style.maxWidth = "480px";
    img.style.width = "80%";
    img.style.borderRadius = "8px";
    img.style.boxShadow = "0 12px 30px rgba(0,0,0,0.6)";
    container.appendChild(img);

    const heading = document.createElement("h1");
    heading.textContent = message;
    heading.style.color = "red";
    heading.style.fontFamily = "monospace";
    heading.style.fontSize = "clamp(18px, 3.5vw, 36px)";
    heading.style.margin = "0";
    container.appendChild(heading);

    const sub = document.createElement("p");
    sub.textContent = "This incident will be reported to the Cyber Security Division.";
    sub.style.color = "#ddd";
    sub.style.margin = "0";
    sub.style.fontSize = "16px";
    container.appendChild(sub);

    const baitBtn = document.createElement("button");
    baitBtn.textContent = "EXIT";
    Object.assign(baitBtn.style, {
      padding: "15px 30px",
      fontSize: "18px",
      background: "#28a745",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      marginTop: "20px",
      boxShadow: "0 8px 20px rgba(40,167,69,0.25)",
      fontWeight: "700"
    });
    baitBtn.onclick = () => {
      try {
        window.location.href = redirectUrl;
      } catch (e) {
        console.warn("Redirect failed", e);
      }
    };
    baitBtn.setAttribute("role", "button");
    baitBtn.setAttribute("aria-label", "Restore Access");
    container.appendChild(baitBtn);

    document.body.appendChild(container);
  } catch (e) {
    console.warn("Failed to render takeover UI", e);
  }
}

async function triggerHoneypot(username) {
  try {
    localStorage.setItem("device_banned", "true");
  } catch {}
  try {
    await logAuditEvent({
      action: "HONEYPOT_TRIGGERED",
      details: { attemptedUser: username, reason: "Bait button triggered" }
    });
  } catch (e) {
    console.warn("Failed to log honeypot event", e);
  }

  renderTakeover("SECURITY VIOLATION DETECTED", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
}

/* ---------------- Login ---------------- */
export async function login() {
  const isBanned = localStorage.getItem("device_banned") === "true";
  const adminImmune = localStorage.getItem("admin_immunity") === "true";
  if (isBanned && !adminImmune) {
    alert("ACCESS DENIED: You are still banned. Nice try though.");
    renderTakeover("ACCESS DENIED", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    return;
  }

  const usernameEl = document.getElementById("loginUsername");
  const username = usernameEl ? usernameEl.value.trim() : "";
  const pin = getPinValue("loginPin");

  // Honeypot trap (full behavior)
  if (username === ADMIN_USERNAME && pin === ADMIN_PIN) {
    if (localStorage.getItem("admin_immunity") === "true") {
      showToast("Shield Active", "Decoy credentials ignored.", "info");
      return;
    }
    await triggerHoneypot(username);
    return;
  }

  if (!username || !pin) {
    showMessage("loginMessage", "Please enter username and PIN", "error");
    return;
  }

  const locked = lockoutInfo(username);
  if (locked.locked) {
    showMessage(
      "loginMessage",
      `Too many attempts. Try again in ${Math.ceil(locked.remaining / 60000)} minutes.`,
      "error"
    );
    return;
  }

  try {
    showToast("Signing in", "Checking account...", "info");

    // Admin via Firebase Auth (email/pass)
    if (username.includes("@")) {
      try {
        const userCred = await signInWithEmailAndPassword(auth, username, pin);
        const fbUser = userCred && userCred.user;
        const ADMIN_UID = "OZMHbaXqBPUjFg65aBBE7px6FSf2";
        if (!fbUser || fbUser.uid !== ADMIN_UID) {
          registerLoginAttempt(username);
          showMessage("loginMessage", "Username not found", "error");
          return;
        }

        dismissToastByTitle("Signing in");
        state.isAdmin = true;
        state.currentUser = {
          id: ADMIN_UID,
          fname: fbUser.displayName || "System",
          mname: "",
          lname: "Admin",
          username: ADMIN_USERNAME,
          balance: 0.0,
          lastTransaction: null,
          accountType: "premium"
        };

        const loginPinEl = document.getElementById("loginPin");
        if (loginPinEl) {
          loginPinEl.value = "";
          loginPinEl.removeAttribute("data-pin-value");
        }
        const loginUsernameEl = document.getElementById("loginUsername");
        if (loginUsernameEl) loginUsernameEl.value = "";
        hideKeypad();
        showToast("Welcome Admin", "Logged in with admin privileges", "success");
        showPage("adminDashboardPage");
        await logAuditEvent({
          action: "LOGIN",
          details: { username: ADMIN_USERNAME, method: "firebase_auth" }
        });
        return;
      } catch (authErr) {
        registerLoginAttempt(username);
        showMessage("loginMessage", "Username not found", "error");
        return;
      }
    }

    // Standard user
    const user = await fetchUserByUsername(username);
    if (!user) {
      registerLoginAttempt(username);
      showMessage("loginMessage", "Username not found", "error");
      return;
    }

    const salt = user.pin_salt || "";
    const expectedHash = await hashPin(pin, salt);

    if (expectedHash !== user.pin_hash) {
      registerLoginAttempt(username);
      showMessage("loginMessage", "Incorrect PIN", "error");
      return;
    }

    state.isAdmin = false;
    await attachCurrentUserListener(user.id);

    dismissToastByTitle("Signing in");

    const loginPinEl2 = document.getElementById("loginPin");
    if (loginPinEl2) {
      loginPinEl2.value = "";
      loginPinEl2.removeAttribute("data-pin-value");
    }
    const loginUsernameEl2 = document.getElementById("loginUsername");
    if (loginUsernameEl2) loginUsernameEl2.value = "";
    hideKeypad();
    runScheduledForUser();
    showToast("Login successful", `Welcome back, ${user.fname}!`, "success");
    showPage("dashboardPage");
    await evaluateAchievements(user);
    await logAuditEvent({ action: "LOGIN", details: { username } });
  } catch (err) {
    console.error("Login error", err);
    showMessage("loginMessage", "Login failed. Try again.", "error");
  }
}

/* ---------------- Signup ---------------- */
export async function signup() {
  const fname = document.getElementById("signupFname").value.trim();
  const mname = document.getElementById("signupMname").value.trim();
  const lname = document.getElementById("signupLname").value.trim();
  const phoneRaw = document.getElementById("signupPhone").value.trim();
  const phone = sanitizePhone(phoneRaw);
  const address = document.getElementById("signupAddress").value.trim();
  const ageVal = parseInt(document.getElementById("signupAge").value);
  const birthday = document.getElementById("signupBirthday").value.trim();
  const security_question = document.getElementById("signupQuestion").value;
  const security_answer = document.getElementById("signupAnswer").value.trim();
  const username = document.getElementById("signupUsername").value.trim();
  const pin = getPinValue("signupPin");
  const confirmPin = getPinValue("signupConfirmPin");
  const accountType = document.getElementById("signupAccountType").value || "savings";

  if (
    !fname ||
    !mname ||
    !lname ||
    !phone ||
    !address ||
    !birthday ||
    !username ||
    !pin ||
    !confirmPin ||
    !security_answer
  ) {
    showMessage("signupMessage", "All fields, including Security Answer, are required", "error");
    return;
  }

  if (!validatePhone(phone)) {
    showMessage("signupMessage", "Phone must be 10-15 digits", "error");
    return;
  }

  if (!validateBirthday(birthday)) {
    showMessage("signupMessage", "Birthday must be YYYY-MM-DD and age between 10 and 120", "error");
    return;
  }

  if (Number.isNaN(ageVal) || ageVal < 10 || ageVal > 120) {
    showMessage("signupMessage", "Age must be between 10 and 120", "error");
    return;
  }

  if (pin !== confirmPin) {
    showMessage("signupMessage", "PINs do not match", "error");
    return;
  }

  if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    showMessage("signupMessage", "PIN must be 4-6 digits", "error");
    return;
  }

  try {
    const existing = await fetchUserByUsername(username);
    if (existing) {
      showMessage("signupMessage", "Username already exists", "error");
      return;
    }

    const salt = generateSalt();
    const hashed = await hashPin(pin, salt);

    const payload = {
      fname,
      mname,
      lname,
      username,
      birthday,
      phone,
      address,
      age: ageVal,
      pin_hash: hashed,
      pin_salt: salt,
      balance: 0.0,
      security_question,
      security_answer,
      lastTransaction: null,
      favorites: [],
      limitsDaily: { date: null, withdrawUsed: 0, transferUsed: 0 },
      limitsMonthly: { month: null, transferUsed: 0 },
      accountType,
      cardNumber: generateCardNumberFromUsername(username),
      biometricEnabled: false,
      biometricCredentialId: null,
      createdAt: serverTimestamp(),
      birthdayGiftsClaimed: []
    };

    await addDoc(usersCol, payload);

    showMessage("signupMessage", "Account created! You can now login.", "success");
    showToast("Account created", "Please login with your new credentials.", "success");

    const signupPinEl = document.getElementById("signupPin");
    if (signupPinEl) {
      signupPinEl.value = "";
      signupPinEl.removeAttribute("data-pin-value");
    }
    const signupConfirmPinEl = document.getElementById("signupConfirmPin");
    if (signupConfirmPinEl) {
      signupConfirmPinEl.value = "";
      signupConfirmPinEl.removeAttribute("data-pin-value");
    }
    hideKeypad();

    setTimeout(() => showPage("loginPage"), 1000);
  } catch (err) {
    console.error("Signup error", err);
    showMessage("signupMessage", "Failed to create account", "error");
  }
}

/* ---------------- Logout ---------------- */
export function logout() {
  state.currentUser = null;
  state.isAdmin = false;
  if (state.currentUserUnsub) {
    try {
      state.currentUserUnsub();
    } catch {}
    state.currentUserUnsub = null;
  }
  if (state.notificationsUnsub) {
    try {
      state.notificationsUnsub();
    } catch {}
    state.notificationsUnsub = null;
  }
  state.pageStack.length = 0;
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (el.type !== "hidden") el.value = "";
    if (el.hasAttribute("data-pin-value")) el.removeAttribute("data-pin-value");
  });
  hideKeypad();
  clearInactivityTimer();
  showPage("loginPage");
}

/* ---------------- Profile updates ---------------- */
export async function processChangePin() {
  if (!state.currentUser) return;
  const oldPin = getPinValue("changePinOld");
  const newPin = getPinValue("changePinNew");
  const confirmPin = getPinValue("changePinConfirm");

  if (!oldPin || !newPin || !confirmPin) {
    showMessage("changePinMessage", "All fields are required", "error");
    return;
  }

  try {
    const salt = state.currentUser.pin_salt || "";
    const expectedHash = await hashPin(oldPin, salt);

    if (expectedHash !== state.currentUser.pin_hash) {
      showMessage("changePinMessage", "Current PIN is incorrect", "error");
      return;
    }

    if (newPin !== confirmPin) {
      showMessage("changePinMessage", "New PINs do not match", "error");
      return;
    }

    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      showMessage("changePinMessage", "PIN must be 4-6 digits", "error");
      return;
    }

    const newSalt = generateSalt();
    const newHash = await hashPin(newPin, newSalt);
    await updateDoc(doc(db, "users", state.currentUser.id), { pin_hash: newHash, pin_salt: newSalt });
    await logProfileChange("PIN_CHANGED", { pin_hash: state.currentUser.pin_hash }, { pin_hash: newHash });

    showMessage("changePinMessage", "PIN changed successfully!", "success");
    showToast("PIN updated", "Your security PIN has been changed.", "success");

    ["changePinOld", "changePinNew", "changePinConfirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = "";
        el.removeAttribute("data-pin-value");
      }
    });

    setTimeout(() => showPage("settingsPage"), 1500);
  } catch (err) {
    console.error("Change PIN failed", err);
    showMessage("changePinMessage", "Failed to change PIN", "error");
  }
}

export async function processChangeName() {
  if (!state.currentUser) return;
  const fname = document.getElementById("changeNameFname").value.trim();
  const mname = document.getElementById("changeNameMname").value.trim();
  const lname = document.getElementById("changeNameLname").value.trim();

  if (!fname || !mname || !lname) {
    showMessage("changeNameMessage", "All fields are required", "error");
    return;
  }

  const before = { fname: state.currentUser.fname, mname: state.currentUser.mname, lname: state.currentUser.lname };
  await updateDoc(doc(db, "users", state.currentUser.id), { fname, mname, lname });
  await logProfileChange("NAME_CHANGED", before, { fname, mname, lname });

  showMessage("changeNameMessage", "Name updated successfully!", "success");
  showToast("Profile updated", "Your name was changed.", "success");
  clearInputsInPage("changeNamePage");
  setTimeout(() => showPage("settingsPage"), 1500);
}

export async function processChangePhone() {
  if (!state.currentUser) return;
  const phoneRaw = document.getElementById("changePhoneNew").value.trim();
  const phone = sanitizePhone(phoneRaw);

  if (!phone) {
    showMessage("changePhoneMessage", "Phone number is required", "error");
    return;
  }
  if (!validatePhone(phone)) {
    showMessage("changePhoneMessage", "Phone must be 10-15 digits", "error");
    return;
  }

  const before = { phone: state.currentUser.phone };
  await updateDoc(doc(db, "users", state.currentUser.id), { phone });
  await logProfileChange("PHONE_CHANGED", before, { phone });

  showMessage("changePhoneMessage", "Phone updated successfully!", "success");
  showToast("Phone updated", "Your phone number was changed.", "success");
  clearInputsInPage("changePhonePage");
  setTimeout(() => showPage("settingsPage"), 1500);
}

export async function processChangeAddress() {
  if (!state.currentUser) return;
  const address = document.getElementById("changeAddressNew").value.trim();

  if (!address) {
    showMessage("changeAddressMessage", "Address is required", "error");
    return;
  }

  const before = { address: state.currentUser.address };
  await updateDoc(doc(db, "users", state.currentUser.id), { address });
  await logProfileChange("ADDRESS_CHANGED", before, { address });

  showMessage("changeAddressMessage", "Address updated successfully!", "success");
  showToast("Address updated", "Your address was changed.", "success");
  clearInputsInPage("changeAddressPage");
  setTimeout(() => showPage("settingsPage"), 1500);
}

export async function processChangeUsername() {
  if (!state.currentUser) return;
  const oldUsername = document.getElementById("changeUsernameOld").value.trim();
  const newUsername = document.getElementById("changeUsernameNew").value.trim();

  if (!oldUsername || !newUsername) {
    showMessage("changeUsernameMessage", "Both fields are required", "error");
    return;
  }

  if (oldUsername !== state.currentUser.username) {
    showMessage("changeUsernameMessage", "Current username is incorrect", "error");
    return;
  }

  try {
    const existing = await fetchUserByUsername(newUsername);
    if (existing) {
      showMessage("changeUsernameMessage", "Username already exists", "error");
      return;
    }

    const before = { username: state.currentUser.username };
    await updateDoc(doc(db, "users", state.currentUser.id), { username: newUsername });
    state.currentUser.username = newUsername;
    await logProfileChange("USERNAME_CHANGED", before, { username: newUsername });

    showMessage("changeUsernameMessage", `Username changed to '${newUsername}'!`, "success");
    showToast("Username changed", `Now signed in as ${newUsername}`, "success");
    clearInputsInPage("changeUsernamePage");
    setTimeout(() => showPage("settingsPage"), 1500);
  } catch (err) {
    console.error("Change username failed", err);
    showMessage("changeUsernameMessage", "Failed to change username", "error");
  }
}

/* ---------------- PIN recovery ---------------- */
let recoveryAccount = null;
function getQuestionText(key) {
  const questions = {
    mother: "What is your mother's maiden name?",
    pet: "What was the name of your first pet?",
    city: "What city were you born in?"
  };
  return questions[key] || "Security Question";
}

export async function startPinRecovery() {
  const username = document.getElementById("recoveryUsername").value.trim();
  if (!username) {
    showMessage("pinRecoveryMessage", "Please enter your username.", "error");
    return;
  }
  try {
    const account = await fetchUserByUsername(username);
    if (!account || !account.security_question || !account.security_answer) {
      showMessage("pinRecoveryMessage", "Account not found or security details missing.", "error");
      return;
    }
    recoveryAccount = account;
    const step1 = document.getElementById("recoveryStep1");
    const step2 = document.getElementById("recoveryStep2");
    const securityQ = document.getElementById("securityQuestionDisplay");
    if (step1) step1.style.display = "none";
    if (securityQ) securityQ.textContent = getQuestionText(account.security_question);
    if (step2) step2.style.display = "block";
    showMessage("pinRecoveryMessage", "Account found. Please answer your security question.", "info");
  } catch (err) {
    console.error("Pin recovery error", err);
    showMessage("pinRecoveryMessage", "Failed to find account", "error");
  }
}

export function verifyPinAnswer() {
  if (!recoveryAccount) return;
  const answer = document.getElementById("securityAnswerInput").value.trim();
  if (answer.toLowerCase() === recoveryAccount.security_answer.toLowerCase()) {
    const step2 = document.getElementById("recoveryStep2");
    const step3 = document.getElementById("recoveryStep3");
    if (step2) step2.style.display = "none";
    if (step3) step3.style.display = "block";
    const msg = document.getElementById("pinRecoveryMessage");
    if (msg) msg.innerHTML = "";
  } else {
    showMessage("pinRecoveryMessage", "Incorrect security answer.", "error");
  }
}

export async function setNewPin() {
  if (!recoveryAccount) return;

  const newPin = getPinValue("recoveryNewPin");
  const confirmPin = getPinValue("recoveryConfirmPin");

  if (!newPin || !confirmPin) {
    showMessage("pinRecoveryMessage", "Please enter and confirm the new PIN.", "error");
    return;
  }

  if (newPin !== confirmPin) {
    showMessage("pinRecoveryMessage", "New PINs do not match.", "error");
    return;
  }

  if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
    showMessage("pinRecoveryMessage", "PIN must be 4-6 digits", "error");
    return;
  }

  try {
    const newSalt = generateSalt();
    const newHash = await hashPin(newPin, newSalt);
    await updateDoc(doc(db, "users", recoveryAccount.id), { pin_hash: newHash, pin_salt: newSalt });
    await logProfileChange("PIN_RECOVERY", { userId: recoveryAccount.id }, { pin_hash: newHash });

    recoveryAccount = null;
    showMessage("pinRecoveryMessage", "PIN reset successful! You can now login with your new PIN.", "success");
    setTimeout(() => showPage("loginPage"), 2000);
  } catch (err) {
    console.error("Set new PIN failed", err);
    showMessage("pinRecoveryMessage", "Failed to reset PIN.", "error");
  }
}