// scripts/account.js

import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;

// ---------- UI HELPERS ----------
function showProfile(userData, fallbackEmail) {
  const userNameEl = document.getElementById("user-name");
  const userEmailEl = document.getElementById("user-email");
  const userAgeEl = document.getElementById("user-age");
  const userPhoneEl = document.getElementById("user-phone");
  const userLocationEl = document.getElementById("user-location");
  const userJoinedEl = document.getElementById("user-joined");

  if (userNameEl) userNameEl.textContent = userData.name || "N/A";
  if (userEmailEl)
    userEmailEl.textContent = userData.email || fallbackEmail || "N/A";

  if (userAgeEl) {
    if (userData.age !== null && userData.age !== undefined) {
      userAgeEl.textContent = userData.age;
    } else {
      userAgeEl.textContent = "N/A";
    }
  }

  if (userPhoneEl) {
    userPhoneEl.textContent = userData.phone || "N/A";
  }

  if (userLocationEl) {
    userLocationEl.textContent = userData.location || "N/A";
  }

  if (userJoinedEl) {
    if (userData.joined_at) {
      const d = new Date(userData.joined_at);
      userJoinedEl.textContent = d.toLocaleDateString();
    } else {
      userJoinedEl.textContent = "N/A";
    }
  }
}

function syncNavbar(userData) {
  const loginBtn = document.getElementById("login-btn");
  const userMenu = document.getElementById("user-menu");

  if (loginBtn && userMenu) {
    loginBtn.style.display = "none";
    userMenu.style.display = "block";
    const avatar = document.getElementById("user-avatar");
    if (avatar) {
      avatar.textContent = userData?.name
        ? userData.name.charAt(0).toUpperCase()
        : "U";
    }
  }

  const favoritesLink = document.getElementById("favorites-link");
  if (favoritesLink) favoritesLink.style.display = "block";

  const registrationsLink = document.getElementById("registrations-link");
  if (registrationsLink) registrationsLink.style.display = "block";

  const profileLink = document.getElementById("profile-link");
  if (profileLink) profileLink.style.display = "block";

  if (userData && ["admin", "owner"].includes(userData.role)) {
    const adminLink = document.getElementById("admin-link");
    const adminBadge = document.getElementById("admin-badge");
    if (adminLink) adminLink.style.display = "block";
    if (adminBadge) adminBadge.style.display = "block";
  }
}

function showAdminStuff(role) {
  const adminLink = document.getElementById("admin-link");
  if (!adminLink) return;

  if (role === "admin" || role === "owner") {
    adminLink.style.display = "";
  } else {
    adminLink.style.display = "none";
  }
}

// ---------- API: LOAD PROFILE ----------
async function loadProfile(user) {
  try {
    const idToken = await user.getIdToken();

    const res = await fetch("api/me.php", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (res.status === 401) {
      window.location.href = "login.html";
      return;
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to load profile");
    }

    const userData = data.user;
    syncNavbar(userData);
    showProfile(userData, user.email);
    showAdminStuff(userData.role || null);
  } catch (err) {
    console.error("Profile load error:", err);
    alert("Unable to load profile: " + err.message);
  }
}

// ---------- ACTIONS ----------
async function handleDeleteAccount() {
  if (!currentUser) {
    alert("You must be logged in to delete your account.");
    return;
  }

  const confirm1 = confirm(
    "Are you sure you want to delete your account? This cannot be undone."
  );
  if (!confirm1) return;

  const confirm2 = confirm(
    "Final confirmation: ALL your data on Event Finder will be removed. Continue?"
  );
  if (!confirm2) return;

  try {
    const idToken = await currentUser.getIdToken();

    const res = await fetch("api/delete-account.php", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "X-Firebase-UID": currentUser.uid,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to delete account");
    }

    alert("Your account has been deleted. You will be logged out.");

    await signOut(auth);
    window.location.href = "login.html";
  } catch (err) {
    console.error("Delete account error:", err);
    alert("Unable to delete account: " + err.message);
  }
}

// ---------- INIT ----------
function initAccountPage() {
  // Auth & profile
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    currentUser = user;
    await loadProfile(user);
  });

  // Get buttons AFTER DOM is ready
  const editProfileBtn = document.getElementById("edit-profile-btn");
  const changePasswordBtn = document.getElementById("change-password-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  const registeredEventsBtn = document.getElementById("registered-events-btn");
  const favoriteEventsBtn = document.getElementById("favorite-events-btn");

  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", () => {
      // you already have edit-profile.html in your project
      window.location.href = "edit-profile.html";
    });
  }

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", () => {
      // you already have change-password.html / forgot-password.html
      window.location.href = "change-password.html";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        window.location.href = "login.html";
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed: " + err.message);
      }
    });
  }

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", handleDeleteAccount);
  }

  if (registeredEventsBtn) {
    registeredEventsBtn.addEventListener("click", () => {
      window.location.href = "registrations.html";
    });
  }

  if (favoriteEventsBtn) {
    favoriteEventsBtn.addEventListener("click", () => {
      window.location.href = "favorites.html";
    });
  }
}

document.addEventListener("DOMContentLoaded", initAccountPage);
