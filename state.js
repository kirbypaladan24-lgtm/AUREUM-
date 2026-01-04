export const state = {
  currentUser: null,
  currentUserUnsub: null,
  isAdmin: false,
  currentModifiedUser: null,
  accounts: [],            // Cache of all users (admin views, transfers)
  usersUnsub: null,        // Listener for users
  requestsCache: [],
  requestsUnsub: null,
  notificationItems: [],
  notificationsUnsub: null,
  pageStack: ['loginPage'], // Navigation history
  nav: {
    showPage: (pageId) => console.warn("showPage not ready", pageId) // set by app.js
  }
};