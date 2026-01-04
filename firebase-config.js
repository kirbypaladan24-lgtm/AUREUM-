import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYYCt3VrFZjN6Wue1wJya3h2jsC2BagYA",
  authDomain: "aureum-bank.firebaseapp.com",
  projectId: "aureum-bank",
  storageBucket: "aureum-bank.firebasestorage.app",
  messagingSenderId: "927681810502",
  appId: "1:927681810502:web:42449d5fe246814451ba47",
  measurementId: "G-QXWE88F5ML"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  app, db, auth,
  collection, doc, getDoc, onSnapshot, runTransaction, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, getDocs, orderBy, limit,
  serverTimestamp, increment, Timestamp,
  signInWithEmailAndPassword
};