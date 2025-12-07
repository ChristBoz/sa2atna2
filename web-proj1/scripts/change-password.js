import { auth } from "./firebase-config.js";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const form = document.getElementById("change-password-form");
const currentPasswordInput = document.getElementById("current-password");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const statusEl = document.getElementById("password-status");
const cancelBtn = document.getElementById("cancel-password-btn");
const saveBtn = document.getElementById("save-password-btn");

let currentUser = null;

function isStrongPassword(value) {
  // At least one uppercase, one lowercase, one digit, one symbol, and 8+ characters
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);
}

function setStatus(message, color = "#d9534f") {
  statusEl.textContent = message;
  statusEl.style.color = color;
}

function toggleBusy(isBusy) {
  saveBtn.disabled = isBusy;
  saveBtn.textContent = isBusy ? "Saving..." : "Update Password";
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  const errors = [];
  if (!currentPassword) errors.push("Current password is required");
  if (!newPassword) errors.push("New password is required");
  if (newPassword && !isStrongPassword(newPassword))
    errors.push(
      "New password must be 8+ chars with upper, lower, number, and symbol"
    );
  if (newPassword === currentPassword)
    errors.push("New password must be different from current password");
  if (newPassword !== confirmPassword)
    errors.push("New passwords do not match");

  if (errors.length) {
    setStatus(errors.join(". "));
    return;
  }

  setStatus("");
  toggleBusy(true);

  try {
    const credential = EmailAuthProvider.credential(
      currentUser.email || "",
      currentPassword
    );
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);

    setStatus("Password updated successfully! Redirecting...", "green");
    setTimeout(() => {
      window.location.href = "account.html";
    }, 1200);
  } catch (error) {
    console.error("Password change error", error);

    let message = "Unable to change password";
    switch (error.code) {
      case "auth/wrong-password":
      case "auth/invalid-credential":
        message = "Current password is incorrect";
        break;
      case "auth/weak-password":
        message = "New password is too weak";
        break;
      case "auth/requires-recent-login":
        message = "Please re-login and try again to change your password";
        break;
      default:
        if (error.message) message = error.message;
    }

    setStatus(message);
  } finally {
    toggleBusy(false);
  }
});

cancelBtn?.addEventListener("click", () => {
  window.location.href = "account.html";
});
