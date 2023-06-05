import ExtPay from "extpay";
import {checkIfWordLimitExceeded} from "./firebase";
var extpay = ExtPay('summary-extension'); // Careful! See note below
extpay.startBackground();

export async function checkPaymentStatus(str = '') {
  const user = await extpay.getUser();
  if (!user.paid && !user.trialStartedAt) {
    await extpay.openTrialPage();
  } else if (await checkIfWordLimitExceeded(str, user) && !user.paid) {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    chrome.tabs.sendMessage(activeTab.id, { action: 'showLimitExceededAlert' }, async () => {
      await extpay.openPaymentPage();
    });
  } else {
    return true;
  }
  return false;
}

export async function openPaymentPage() {
  await extpay.openPaymentPage();
}

export async function getUser() {
  return await extpay.getUser();
}

export async function isLoggedIn() {
  const user = await extpay.getUser();
  return user.email;
}

export async function openSignUp() {
  await extpay.openTrialPage();
}
