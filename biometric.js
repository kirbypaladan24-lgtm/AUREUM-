import {
  getDocs,
  query,
  where
} from "./firebase-config.js";
import { usersCol } from "./constants.js";
import { state } from "./state.js";
import { attachCurrentUserListener } from "./auth.js";
import { showToast } from "./toast.js";
import { runScheduledForUser } from "./scheduled.js";
import { evaluateAchievements } from "./achievements.js";
import { showPage } from "./navigation.js";
import { logAuditEvent } from "./audit.js";

/**
 * Enable biometric (WebAuthn) for the current user.
 * Preserves v1 behavior; requires HTTPS/localhost and platform authenticator.
 */
export async function enableBiometricFlow() {
  if (!state.currentUser) {
    showToast("Not logged in", "Please login first to enable biometrics.", "error");
    return;
  }
  if (!window.PublicKeyCredential) {
    showToast("Not Supported", "Biometric authentication is not supported on this browser/device.", "error");
    return;
  }
  if (!window.isSecureContext && location.hostname !== "localhost") {
    showToast("Secure Context Required", "Biometrics only work on HTTPS or localhost.", "error");
    return;
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      showToast("Not Available", "No biometric authenticator found on this device.", "error");
      return;
    }
    const userId = new TextEncoder().encode(state.currentUser.username);
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "ATM Banking System", id: window.location.hostname },
        user: {
          id: userId,
          name: state.currentUser.username,
          displayName: `${state.currentUser.fname} ${state.currentUser.lname}`
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required"
        },
        timeout: 60000
      }
    });
    if (credential) {
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      await updateBiometric(state.currentUser.id, credentialId);
      showToast("Biometric Enabled", "You can now login using biometrics!", "success");
    }
  } catch (e) {
    console.error("Biometric registration error:", e);
    if (e.name === "NotAllowedError") showToast("Cancelled", "Biometric setup was cancelled.", "warning");
    else if (e.name === "SecurityError") showToast("Security Error", "Biometrics require HTTPS or localhost.", "error");
    else showToast("Setup Failed", e.message || "Could not enable biometrics.", "error");
  }
}

/**
 * Biometric login (WebAuthn) — fixed to include runScheduledForUser.
 */
export async function tryBiometricLogin() {
  if (!window.PublicKeyCredential) {
    showToast("Not Supported", "Biometric authentication is not supported on this browser/device.", "error");
    return;
  }
  if (!window.isSecureContext && location.hostname !== "localhost") {
    showToast("Secure Context Required", "Biometrics only work on HTTPS or localhost.", "error");
    return;
  }
  try {
    const snap = await getDocs(query(usersCol, where("biometricEnabled", "==", true)));
    const biometricAccounts = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    if (biometricAccounts.length === 0) {
      showToast("No Biometric Setup", "No accounts have biometrics enabled. Login and enable in Settings.", "warning");
      return;
    }

    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      showToast("Not Available", "No biometric authenticator found on this device.", "error");
      return;
    }

    const allowCredentials = biometricAccounts.map((acc) => ({
      type: "public-key",
      id: Uint8Array.from(atob(acc.biometricCredentialId), (c) => c.charCodeAt(0)),
      transports: ["internal"]
    }));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: "required",
        timeout: 60000
      }
    });

    if (assertion) {
      const usedCredentialId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
      const matchedAccount = biometricAccounts.find((acc) => acc.biometricCredentialId === usedCredentialId);
      if (matchedAccount) {
        state.isAdmin = false;
        await attachCurrentUserListener(matchedAccount.id);
        // run scheduled for this user (fixes "runScheduledForUser is not defined")
        runScheduledForUser();
        showToast("Biometric Login", `Welcome back, ${matchedAccount.fname || matchedAccount.username}!`, "success");
        await logAuditEvent({ action: "BIOMETRIC_LOGIN", details: { username: matchedAccount.username } });
        showPage("dashboardPage");
        await evaluateAchievements(matchedAccount);
        return;
      }
      showToast("Login Failed", "Could not match biometric credential.", "error");
    }
  } catch (e) {
    console.error("Biometric login error:", e);
    if (e.name === "NotAllowedError") showToast("Cancelled", "Biometric login was cancelled.", "warning");
    else showToast("Login Failed", e.message || "Biometric authentication failed.", "error");
  }
}

/* Helpers */

async function updateBiometric(userId, credentialId) {
  const { updateDoc, doc } = await import("./firebase-config.js");
  await updateDoc(doc(usersCol, userId), { biometricCredentialId: credentialId, biometricEnabled: true });
}