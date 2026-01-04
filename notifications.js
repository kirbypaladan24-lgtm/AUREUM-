import {
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  doc
} from "./firebase-config.js";
import { notificationsCol } from "./constants.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";
import { showPage } from "./navigation.js";

// Local delete tracking
const LOCAL_DELETE_KEY = "locally_deleted_notifications";
let locallyDeletedIds = [];
export function loadLocallyDeletedIds() {
  try {
    const raw = localStorage.getItem(LOCAL_DELETE_KEY);
    locallyDeletedIds = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch {
    locallyDeletedIds = [];
  }
}
function persistLocallyDeletedIds() {
  try {
    localStorage.setItem(LOCAL_DELETE_KEY, JSON.stringify(locallyDeletedIds));
  } catch {}
}
function addLocalDelete(id) {
  if (!id) return;
  if (!locallyDeletedIds.includes(id)) {
    locallyDeletedIds.push(id);
    persistLocallyDeletedIds();
  }
}
function addLocalDeletes(ids = []) {
  let changed = false;
  ids.forEach((id) => {
    if (id && !locallyDeletedIds.includes(id)) {
      locallyDeletedIds.push(id);
      changed = true;
    }
  });
  if (changed) persistLocallyDeletedIds();
}

// UI handles
let notificationBellBtn = null;
let notificationPanel = null;

// Expose navigation setter for other modules if needed
let navApi = { showPage };
export function setNavigationApi(api) {
  navApi = { ...navApi, ...api };
}

/* Helpers */
function getVisibleNotifications() {
  return (state.notificationItems || []).filter((n) => !locallyDeletedIds.includes(n.id));
}

function updateBellDot() {
  if (!notificationBellBtn) return;
  const dot = notificationBellBtn.querySelector(".notif-dot");
  if (!dot) return;
  const unreadCount = getVisibleNotifications().filter((n) => !n.read).length;
  dot.hidden = unreadCount <= 0;
}

/* Creation with dedupe */
export async function createNotification(toUsername, title, message, meta = {}) {
  try {
    const rid = meta && meta.requestId ? String(meta.requestId) : "";
    const tShort = String(title).slice(0, 200);
    const mShort = String(message).slice(0, 400);
    const dedupeKey = `${toUsername}::${rid}::${tShort}::${mShort}`;

    let existing = null;
    try {
      const dupQ = query(notificationsCol, where("dedupeKey", "==", dedupeKey), limit(1));
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty) existing = dupSnap.docs[0];
    } catch (e) {
      if (rid) {
        const fallbackQ = query(
          notificationsCol,
          where("to", "==", toUsername),
          where("meta.requestId", "==", rid),
          limit(1)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        if (!fallbackSnap.empty) existing = fallbackSnap.docs[0];
      }
    }

    if (existing) {
      await updateDoc(existing.ref, {
        title,
        message,
        meta: { ...(existing.data().meta || {}), ...meta },
        dedupeKey,
        createdAt: serverTimestamp(),
        delivered: false,
        read: false
      });
      return;
    }

    await addDoc(notificationsCol, {
      to: toUsername,
      title,
      message,
      meta,
      dedupeKey,
      createdAt: serverTimestamp(),
      delivered: false,
      read: false
    });
  } catch (err) {
    console.error("Failed to create notification", err);
  }
}

/* Delivery toasts */
export async function deliverPendingNotificationsForUser(username) {
  if (!username) return;
  try {
    const q = query(notificationsCol, where("to", "==", username), where("delivered", "==", false));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const seenKeys = new Set();
    const ops = [];
    snap.forEach((d) => {
      const n = d.data();
      const key =
        n.dedupeKey || `${n.title}::${n.message}::${n.meta && n.meta.requestId ? n.meta.requestId : ""}`;
      const isBirthday = n.meta && n.meta.type === "BDAY_GIFT";
      if (!seenKeys.has(key) && !isBirthday) {
        showToast(n.title || "Notification", n.message || "", "info");
        seenKeys.add(key);
      }
      ops.push(updateDoc(d.ref, { delivered: true, deliveredAt: serverTimestamp() }));
    });
    await Promise.all(ops);
  } catch (err) {
    console.error("Deliver notifications failed", err);
  }
}

/* Panel + Page UI */
export function ensureNotificationUI() {
  if (notificationBellBtn && notificationPanel) return;
  const userGreeting = document.getElementById("userGreeting");
  const hostCard =
    (userGreeting && userGreeting.closest(".account-info")) ||
    document.querySelector("#dashboardPage .account-info") ||
    document.getElementById("dashboardPage") ||
    document.body;

  if (!hostCard) return;
  hostCard.style.position = hostCard.style.position || "relative";

  notificationBellBtn = document.createElement("button");
  notificationBellBtn.type = "button";
  notificationBellBtn.id = "notificationBell";
  notificationBellBtn.className = "notif-bell-btn";
  notificationBellBtn.setAttribute("aria-label", "Notifications");
  notificationBellBtn.innerHTML = `
    <span class="notif-bell-icon" aria-hidden="true">🔔</span>
    <span class="notif-dot" hidden></span>
  `;
  notificationBellBtn.addEventListener("click", () => {
    navApi.showPage("notificationsPage");
    renderNotificationsPage();
  });

  notificationPanel = document.createElement("div");
  notificationPanel.id = "notificationPanel";
  notificationPanel.className = "notif-panel";
  notificationPanel.setAttribute("role", "menu");
  notificationPanel.innerHTML = `
    <div class="notif-panel-header">
      <div class="notif-header-top">Notifications</div>
      <div class="notif-actions">
        <button type="button" class="notif-action-btn" onclick="markAllNotificationsAsRead()">Mark all as read</button>
        <button type="button" class="notif-action-btn" onclick="clearLocalNotificationsView()">Delete All</button>
      </div>
    </div>
    <div class="notif-list" id="notifListBody"><div class="notif-empty">No notifications yet.</div></div>
  `;

  hostCard.appendChild(notificationBellBtn);
  hostCard.appendChild(notificationPanel);
}

export function renderNotificationPanel() {
  if (!notificationPanel) return;
  const body = notificationPanel.querySelector("#notifListBody");
  if (!body) return;
  const visible = getVisibleNotifications();
  if (!visible || visible.length === 0) {
    body.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
  } else {
    body.innerHTML = visible
      .map((n) => {
        const isUnread = !n.read;
        const timeStr =
          n.createdAt && typeof n.createdAt.toDate === "function"
            ? n.createdAt.toDate().toLocaleString()
            : n.createdAt || "";
        const badge = n.meta?.type ? `<span class="notif-badge">${n.meta.type.replace(/_/g, " ")}</span>` : "";
        return `
          <div class="notif-item ${isUnread ? "unread" : ""}" data-id="${n.id}" role="button" tabindex="0">
            <div class="notif-title">${n.title || "Notification"} ${badge}</div>
            <div class="notif-msg">${n.message || ""}</div>
            <div class="notif-meta">
              <span class="notif-time">${timeStr}</span>
              <button class="notif-delete-btn" onclick="event.stopPropagation(); deleteNotification('${n.id}')">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");
    body.querySelectorAll(".notif-item").forEach((btn) => {
      btn.addEventListener("click", () => handleNotificationClick(btn.getAttribute("data-id")));
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleNotificationClick(btn.getAttribute("data-id"));
        }
      });
    });
  }
  updateBellDot();
}

export function renderNotificationsPage() {
  const listEl = document.getElementById("notificationsListPage");
  if (!listEl) return;
  const visible = getVisibleNotifications();
  if (!visible || visible.length === 0) {
    listEl.innerHTML = '<div class="info-box">No notifications to show.</div>';
    return;
  }
  listEl.innerHTML = visible
    .map((n) => {
      const isUnread = !n.read;
      const timeStr =
        n.createdAt && typeof n.createdAt.toDate === "function"
          ? n.createdAt.toDate().toLocaleString()
          : n.createdAt || "";
      const badge = n.meta?.type ? `<span class="chip-tag">${n.meta.type.replace(/_/g, " ")}</span>` : "";
      return `
        <div class="transaction-item ${isUnread ? "unread" : ""}" data-id="${n.id}" style="cursor:pointer;" onclick="handleNotificationClick('${n.id}')">
          <div class="transaction-header" style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <span>${n.title || "Notification"} ${badge}</span>
          </div>
          <div class="transaction-details">${n.message || ""}</div>
          <div class="flex" style="margin-top:10px;justify-content:space-between;align-items:center;">
            <span class="tiny">${timeStr}</span>
            <button class="notif-delete-btn" onclick="event.stopPropagation(); deleteNotification('${n.id}')">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
  updateBellDot();
}

/* Actions */
export async function markNotificationRead(id) {
  try {
    const item = state.notificationItems.find((n) => n.id === id);
    if (!item) return;
    if (!item.read) {
      await updateDoc(doc(notificationsCol, id), { read: true });
      item.read = true;
      renderNotificationPanel();
      renderNotificationsPage();
    }
  } catch (e) {
    console.warn("markNotificationRead failed", e);
  }
}

export function toggleNotificationPanel() {
  navApi.showPage("notificationsPage");
  renderNotificationsPage();
}

export async function markAllNotificationsAsRead() {
  if (!state.currentUser) return;
  try {
    const snap = await getDocs(
      query(notificationsCol, where("to", "==", state.currentUser.username), where("read", "==", false))
    );
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
    state.notificationItems = state.notificationItems.map((n) => ({ ...n, read: true }));
    renderNotificationPanel();
    renderNotificationsPage();
  } catch (e) {
    console.warn("markAllNotificationsAsRead failed", e);
    showToast("Error", "Could not mark all as read.", "error");
  }
}

export function clearLocalNotificationsView() {
  addLocalDeletes(state.notificationItems.map((n) => n.id));
  renderNotificationPanel();
  renderNotificationsPage();
  updateBellDot();
}

export function deleteNotification(id) {
  if (!id) return;
  addLocalDelete(id);
  renderNotificationPanel();
  renderNotificationsPage();
  updateBellDot();
}

export function deleteAllNotifications() {
  clearLocalNotificationsView();
}

/* Click handler */
export async function handleNotificationClick(id) {
  const item = state.notificationItems.find((n) => n.id === id);
  if (!item) return;
  const metaType = item.meta?.type;
  try {
    if (metaType === "REQUEST" || metaType === "REQUEST_RESPONSE") {
      navApi.showPage("requestsPage");
    } else if (metaType === "BDAY_GIFT") {
      const yearKey = item.meta?.year || String(new Date().getFullYear());
      const { claimBirthdayGift } = await import("./birthday.js");
      await claimBirthdayGift(state.currentUser.id, yearKey, null);
    } else {
      navApi.showPage("dashboardPage");
    }
  } catch (e) {
    console.warn("notification click action failed", e);
  }
  markNotificationRead(id);
}

/* Listener */
export function startNotificationsListener(username) {
  if (!username) return;
  if (state.notificationsUnsub) {
    try {
      state.notificationsUnsub();
    } catch {}
    state.notificationsUnsub = null;
  }
  try {
    const qNotif = query(notificationsCol, where("to", "==", username), limit(50));
    state.notificationsUnsub = onSnapshot(
      qNotif,
      (snap) => {
        state.notificationItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        state.notificationItems.sort((a, b) => {
          const ta =
            a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : 0;
          const tb =
            b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : 0;
          return tb - ta;
        });
        renderNotificationPanel();
        renderNotificationsPage();
      },
      (err) => console.warn("notifications listener error", err)
    );
  } catch (e) {
    console.warn("notifications listener setup failed", e);
  }
}

/* Bell/UI init */
export function updateBellDotPublic() {
  updateBellDot();
}