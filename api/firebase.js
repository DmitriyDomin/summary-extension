import { initializeApp } from "firebase/app";
import { getFirestore, getDoc, setDoc, doc, updateDoc } from "firebase/firestore";
import { getUser } from "./extpay";
import { calculateTokenNumber } from "../helpers/helpers";

const WORD_LIMIT = 500000;

const firebaseConfig = {
  apiKey: "REDACTED_GOOGLE_API_KEY",
  authDomain: "summary-ext.firebaseapp.com",
  projectId: "summary-ext",
  storageBucket: "summary-ext.appspot.com",
  messagingSenderId: "REDACTED",
  appId: "REDACTED",
  measurementId: "REDACTED"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function updateWordCount(str) {
  const wordCount = calculateTokenNumber(str);
  const user = await getUser();

  let userDoc = doc(db, 'users', user.email);
  let docSnap = await getDoc(userDoc);

  if (docSnap.exists()) {
    // Update word count if document exists
    let currentWordCount = docSnap.data().wordCount || 0;
    await updateDoc(userDoc, { wordCount: currentWordCount + wordCount });
  } else {
    // Create a new document with email and wordCount if it does not exist
    await createUser(user, wordCount);
  }
}

async function createUser(user, wordCount = 0) {
  let userDoc = doc(db, 'users', user.email);
  await setDoc(userDoc, { email: user.email, wordCount: wordCount });
}

export async function checkIfWordLimitExceeded(str, user) {
  const wordCount = calculateTokenNumber(str);

  let userDoc = doc(db, 'users', user.email);
  let docSnap = await getDoc(userDoc);
  if (docSnap.exists()) {
    const totalWords = docSnap ? (docSnap.data().wordCount || 0) + wordCount : 0;
    return totalWords > WORD_LIMIT;
  } else {
    await createUser(user);
    return true;
  }
}

export async function getNumberOfWordsLeft(user) {
  let userDoc = doc(db, 'users', user.email);
  let docSnap = await getDoc(userDoc);
  return docSnap ? WORD_LIMIT - docSnap.data().wordCount || 0 : 0;
}

