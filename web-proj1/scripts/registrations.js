// registrations.js – fixed paths

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let registrations = [];

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      await loadCurrentUser(firebaseUser);
      updateUIForLoggedIn();
      await loadRegistrations();
    } else {
      showAuthRequired();
    }
  });
});

async function loadCurrentUser(firebaseUser) {
  try {
    const response = await fetch("api/me.php", {
      headers: { "X-Firebase-UID": firebaseUser.uid },
    });
    const data = await response.json();
    if (data.user) {
      currentUser = data.user;
    }
  } catch (error) {
    console.error("Failed to load user:", error);
  }
}

function updateUIForLoggedIn() {
  const loginBtn = document.getElementById("login-btn");
  const userMenu = document.getElementById("user-menu");
  if (loginBtn && userMenu) {
    loginBtn.style.display = "none";
    userMenu.style.display = "block";
    const avatar = document.getElementById("user-avatar");
    if (avatar) {
      avatar.textContent = currentUser?.name
        ? currentUser.name.charAt(0).toUpperCase()
        : "U";
    }
  }

  const favoritesLink = document.getElementById("favorites-link");
  if (favoritesLink) favoritesLink.style.display = "block";

  const accountLink = document.getElementById("profile-link");
  if (accountLink) accountLink.style.display = "block";

  if (currentUser && ["admin", "owner"].includes(currentUser.role)) {
    const adminLink = document.getElementById("admin-link");
    if (adminLink) adminLink.style.display = "block";
    const adminBadge = document.getElementById("admin-badge");
    if (adminBadge) adminBadge.style.display = "block";
  }
}

function showAuthRequired() {
  const container = document.getElementById("registrations-container");
  container.innerHTML = `
    <div class="auth-required">
      <h2>🔒 Login Required</h2>
      <p>Please log in to view your registrations.</p>
      <a href="login.html" class="login-btn">Go to Login</a>
    </div>
  `;
}

async function loadRegistrations() {
  const container = document.getElementById("registrations-container");

  try {
    const firebaseUser = auth.currentUser;
    const response = await fetch("api/registrations.php", {
      headers: { "X-Firebase-UID": firebaseUser.uid },
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load registrations");
    }

    registrations = data.registrations || [];
    document.getElementById("registrations-subtitle").textContent =
      registrations.length === 0
        ? "You haven't registered for any events yet."
        : `You have ${registrations.length} registration${
            registrations.length === 1 ? "" : "s"
          }.`; 
    renderRegistrations();
  } catch (error) {
    console.error("Failed to load registrations:", error);
    container.innerHTML = `
      <div class="error-state">
        <h3>⚠️ Error</h3>
        <p>${error.message}</p>
        <a href="index.html" class="browse-btn">Go Home</a>
      </div>
    `;
  }
}

function renderRegistrations() {
  const container = document.getElementById("registrations-container");

  if (!registrations.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>📭 No Registrations Yet</h3>
        <p>Find an event you like and tap Register.</p>
        <a href="index.html" class="browse-btn">Browse Events</a>
      </div>
    `;
    return;
  }

  container.innerHTML = '<div class="registrations-grid"></div>';
  const grid = container.querySelector(".registrations-grid");

  registrations.forEach((event) => {
    const card = document.createElement("div");
    card.className = "registration-card";

    const imageUrl =
      event.image_url &&
      typeof event.image_url === "string" &&
      event.image_url.trim()
        ? event.image_url
        : "https://via.placeholder.com/400x200?text=Event";
    const price =
      event.price > 0 ? `$${parseFloat(event.price).toFixed(2)}` : "FREE";
    const registeredAt = event.created_at
      ? new Date(event.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";

    card.innerHTML = `
      <img src="${imageUrl}" alt="${
      event.name || event.title || "Event"
    }" onerror="this.src='https://via.placeholder.com/400x200?text=Event'" />
      <div class="registration-info">
        <h3>${event.name || event.title || "Event"}</h3>
        <p class="registration-details">
          📍 ${event.location || "Location TBA"}<br />
          📅 ${event.date || "Date TBA"} ${
      event.time ? "• 🕐 " + event.time : ""
    }
        </p>
        <span class="registration-status">✅ Registered${
          registeredAt ? ` • ${registeredAt}` : ""
        }</span>
        <div class="registration-actions">
          <a class="view-btn" href="event.html?id=${
            event.event_id || event.id
          }" aria-label="View event details">View Details</a>
          <button class="cancel-btn" data-event-id="${
            event.event_id || event.id
          }">Cancel</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  grid
    .querySelectorAll(".cancel-btn")
    .forEach((btn) =>
      btn.addEventListener("click", (e) =>
        cancelRegistration(parseInt(e.currentTarget.dataset.eventId))
      )
    );
}

async function cancelRegistration(eventId) {
  if (!confirm("Cancel this registration?")) return;

  try {
    const response = await fetch(
      `api/registrations.php?event_id=${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { "X-Firebase-UID": auth.currentUser.uid },
      }
    );
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Cancel failed");
    }

    registrations = registrations.filter(
      (item) => (item.event_id || item.id) !== eventId
    );
    document.getElementById("registrations-subtitle").textContent =
      registrations.length === 0
        ? "You haven't registered for any events yet."
        : `You have ${registrations.length} registration${
            registrations.length === 1 ? "" : "s"
          }.`; 
    renderRegistrations();
  } catch (error) {
    console.error("Cancel registration failed:", error);
    alert(error.message || "Failed to cancel registration");
  }
}
