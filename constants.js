// constants.js
import {
  db,
  collection
} from "./firebase-config.js";

export const WITHDRAWAL_TAX_RATE = 0.02;
export const MONTHLY_INTEREST_RATE = 0.015;
export const ADMIN_USERNAME = "Admin";
export const ADMIN_PIN = "9999";
export const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
export const DAILY_WITHDRAW_LIMIT = 10000;
export const DAILY_TRANSFER_LIMIT = 10000;
export const MONTHLY_TRANSFER_LIMIT = 50000;
export const OTP_HIGH_VALUE = 5000;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export const ACCOUNT_TYPES = {
  savings: { label: 'Savings', interestRate: 0.015, withdrawLimit: 10000, transferLimit: 10000, monthlyTransfer: 50000 },
  checking: { label: 'Checking', interestRate: 0.005, withdrawLimit: 50000, transferLimit: 50000, monthlyTransfer: 200000 },
  premium: { label: 'Premium', interestRate: 0.025, withdrawLimit: 100000, transferLimit: 100000, monthlyTransfer: 300000 }
};

export const BILLERS = [
  { id: 'electric', name: 'Electric Company', accountFormat: /^\d{10}$/ },
  { id: 'water', name: 'Water District', accountFormat: /^\d{8}$/ },
  { id: 'internet', name: 'Internet Provider', accountFormat: /^\d{12}$/ },
  { id: 'phone', name: 'Phone Company', accountFormat: /^\d{11}$/ }
];

export const ACHIEVEMENT_DEFS = [
  { id: 'first_deposit', title: 'First Deposit', desc: 'Complete your first deposit' },
  { id: 'deposit_5', title: 'Deposit Enthusiast', desc: 'Make 5 deposits' },
  { id: 'transfer_5', title: 'Helpful Sender', desc: 'Send 5 transfers' },
  { id: 'balance_10k', title: '5-Figure Club', desc: 'Reach ₱10,000 balance' },
  { id: 'balance_50k', title: 'Gold Saver', desc: 'Reach ₱50,000 balance' },
  { id: 'goal_complete', title: 'Goal Crusher', desc: 'Complete a savings goal' }
];

// Firestore collections
export const usersCol = collection(db, 'users');
export const transactionsCol = collection(db, 'transactions');
export const requestsCol = collection(db, 'requests');
export const scheduledCol = collection(db, 'scheduled_transfers');
export const achievementsCol = collection(db, 'achievements');
export const auditCol = collection(db, 'audit');
export const notificationsCol = collection(db, 'notifications');

// Local delete key for notifications
export const LOCAL_DELETE_KEY = 'locally_deleted_notifications';