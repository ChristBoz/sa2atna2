import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;

window.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      window.location.href = "login.html";
      return;
    }

    try {
      await loadCurrentUser(firebaseUser);

      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        alert("Admin access required.");
        window.location.href = "index.html";
        return;
      }

      updateNavUI();
    } catch (error) {
      console.error("Admin init failed:", error);
    }
  });
});

async function loadCurrentUser(firebaseUser) {
  const response = await fetch("api/me.php", {
    headers: { "X-Firebase-UID": firebaseUser.uid },
  });
  const data = await response.json();
  if (!data.user) throw new Error("Unable to load user");
  currentUser = data.user;
}

function updateNavUI() {
  const loginBtn = document.getElementById("login-btn");
  const userMenu = document.getElementById("user-menu");
  if (loginBtn && userMenu) {
    loginBtn.style.display = "none";
    userMenu.style.display = "flex";
    const avatar = document.getElementById("user-avatar");
    if (avatar) {
      avatar.textContent = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U";
    }
  }

  const favoritesLink = document.getElementById("favorites-link");
  if (favoritesLink) favoritesLink.style.display = "block";

  const accountLink = document.getElementById("profile-link");
  if (accountLink) accountLink.style.display = "block";

  const regLink = document.getElementById("registrations-link");
  if (regLink) regLink.style.display = "block";

  const adminBadge = document.getElementById("admin-badge");
  if (adminBadge) adminBadge.style.display = "block";
}
