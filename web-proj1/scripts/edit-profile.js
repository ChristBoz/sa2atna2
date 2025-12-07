import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentFirebaseUser = null;

const nameInput = document.getElementById("edit-name");
const ageInput = document.getElementById("edit-age");
const phoneInput = document.getElementById("edit-phone");
const locationInput = document.getElementById("edit-location");
const bioInput = document.getElementById("edit-bio");
const form = document.getElementById("edit-form");
const cancelBtn = document.getElementById("cancel-btn");
const statusMsg = document.getElementById("status-msg");

function showStatus(message, color = "") {
  statusMsg.textContent = message;
  statusMsg.style.color = color;
}

async function loadProfile() {
  const idToken = await currentFirebaseUser.getIdToken();
  const res = await fetch("api/me.php", {
    headers: {
      Authorization: `Bearer ${idToken}`,
      "X-Firebase-UID": currentFirebaseUser.uid,
    },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    console.error("Profile load failed:", data.error);
    showStatus(data.error || "Unable to load profile", "red");
    return;
  }

  const user = data.user;
  nameInput.value = user.name || "";
  ageInput.value = user.age ?? "";
  phoneInput.value = user.phone || "";
  locationInput.value = user.location || "";
  bioInput.value = user.bio || "";
}

async function saveProfile(event) {
  event.preventDefault();

  const payload = {
    name: nameInput.value.trim(),
    age: ageInput.value === "" ? null : Number(ageInput.value),
    phone: phoneInput.value.trim(),
    location: locationInput.value.trim(),
    bio: bioInput.value.trim(),
  };

  const idToken = await currentFirebaseUser.getIdToken();
  const res = await fetch("api/profile-update.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      "X-Firebase-UID": currentFirebaseUser.uid,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    showStatus(data.error || "Update failed", "red");
    return;
  }

  showStatus("Profile updated! Redirecting...", "green");

  setTimeout(() => {
    window.location.href = "account.html";
  }, 1000);
}

cancelBtn.addEventListener("click", () => {
  window.location.href = "account.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentFirebaseUser = user;
  await loadProfile();
});

form.addEventListener("submit", saveProfile);
