import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let favorites = [];

window.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      await loadCurrentUser(firebaseUser);
      updateUIForLoggedIn();
      await loadFavorites();
    } else {
      showAuthRequired();
    }
  });
});

async function loadCurrentUser(firebaseUser) {
  try {
    const response = await fetch("/web-proj1/api/me.php", {
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
    document.getElementById("admin-link").style.display = "block";
    const adminBadge = document.getElementById("admin-badge");
    if (adminBadge) adminBadge.style.display = "block";
  }
  const regLink = document.getElementById("registrations-link");
  if (regLink) {
    regLink.style.display = "block";
  }
}

function showAuthRequired() {
  const container = document.getElementById("favorites-container");
  container.innerHTML = `
                <div class="auth-required">
                    <h2>🔒 Login Required</h2>
                    <p>Please log in to view your favorite events.</p>
                    <a href="/web-proj1/login.html" class="login-btn">Go to Login</a>
                </div>
            `;
}

async function loadFavorites() {
  const container = document.getElementById("favorites-container");

  try {
    const firebaseUser = auth.currentUser;
    const response = await fetch("/web-proj1/api/favorites.php", {
      headers: { "X-Firebase-UID": firebaseUser.uid },
    });
    const data = await response.json();

    if (data.success) {
      favorites = data.favorites;
      document.getElementById("favorites-subtitle").textContent = `You have ${
        favorites.length
      } saved event${favorites.length !== 1 ? "s" : ""}`;
      renderFavorites();
    } else {
      throw new Error(data.error || "Failed to load favorites");
    }
  } catch (error) {
    console.error("Failed to load favorites:", error);
    container.innerHTML = `
                    <div class="empty-state">
                        <h3>⚠️ Error</h3>
                        <p>Failed to load your favorites. Please try again. </p>
                       <a href="/web-proj1/index.html" class="browse-btn">Go Home</a>
                    </div>
                `;
  }
}

function renderFavorites() {
  const container = document.getElementById("favorites-container");

  if (favorites.length === 0) {
    container.innerHTML = `
                    <div class="empty-state">
                        <h3>💔 No Favorites Yet</h3>
                        <p>You haven't saved any events yet. Start exploring!</p>
                        <a href="/web-proj1/index.html" class="browse-btn">Browse Events</a>
                    </div>
                `;
    return;
  }

  container.innerHTML = '<div class="favorites-grid"></div>';
  const grid = container.querySelector(".favorites-grid");

  favorites.forEach((event) => {
    const card = document.createElement("div");
    card.className = "favorite-card";

    const imageUrl =
      event.image_url &&
      typeof event.image_url === "string" &&
      event.image_url.trim()
        ? event.image_url
        : "https://via.placeholder.com/400x200?text=Event";
    const price =
      event.price > 0 ? `$${parseFloat(event.price).toFixed(2)}` : "FREE";
    const favoritedDate = new Date(event.favorited_at).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );

    const genreLabels = Array.isArray(event.genres)
      ? event.genres
          .map((genre) =>
            typeof genre === "string"
              ? genre
              : genre && typeof genre.name === "string"
              ? genre.name
              : ""
          )
          .filter(Boolean)
      : [];
    const genreIcons = Array.isArray(event.genre_icons)
      ? event.genre_icons
      : [];

    card.innerHTML = `
                    <img src="${imageUrl}" alt="${
      event.title
    }" class="favorite-image" onerror="this.src='https://via.placeholder.com/400x200?text=Event'">

                    <div class="favorite-info">
                        <h3>${
                          event.name || event.title || "Untitled Event"
                        }</h3>

                            <p class="event-details">
                            📍 ${event.location || "Location TBA"}<br>
                            📅 ${event.date || "Date TBA"} ${
      event.time ? "• 🕐 " + event.time : ""
    }<br>
                        </p>

                        <span class="event-price">${price}</span>

                        <div class="event-genres">
                            ${genreLabels
                              .map((label, i) => {
                                const icon = genreIcons[i] || "";
                                return `
                                  <span class=\"genre-tag\">
                                    ${icon ? `<span>${icon}</span>` : ""}
                                    <span>${label}</span>
                                  </span>
                                `;
                              })
                              .join("")}
                        </div>

                        <p class="favorited-date">❤️ Saved on ${favoritedDate}</p>

                        <div class="favorite-actions">
                            <button class="details-btn" data-event-id="${
                              event.id
                            }">View Details</button>
                            <button class="remove-btn" data-event-id="${
                              event.id
                            }">Remove</button>
                        </div>
                    </div>
                `;

    grid.appendChild(card);
  });

  grid
    .querySelectorAll(".details-btn")
    .forEach((btn) =>
      btn.addEventListener("click", (e) =>
        viewEvent(e.currentTarget.dataset.eventId)
      )
    );
  grid
    .querySelectorAll(".remove-btn")
    .forEach((btn) =>
      btn.addEventListener("click", (e) =>
        removeFavorite(parseInt(e.currentTarget.dataset.eventId))
      )
    );
}

async function removeFavorite(eventId) {
  if (!confirm("Remove this event from your favorites?")) {
    return;
  }

  try {
    const firebaseUser = auth.currentUser;
    const response = await fetch(
      `/web-proj1/api/favorites.php?event_id=${eventId}`,
      {
        method: "DELETE",
        headers: { "X-Firebase-UID": firebaseUser.uid },
      }
    );

    const data = await response.json();

    if (data.success) {
      favorites = favorites.filter((f) => f.id !== eventId);
      document.getElementById("favorites-subtitle").textContent = `You have ${
        favorites.length
      } saved event${favorites.length !== 1 ? "s" : ""}`;
      renderFavorites();
    } else {
      alert("Failed to remove favorite: " + (data.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Failed to remove favorite:", error);
    alert("Failed to remove favorite. Please try again.");
  }
}

function viewEvent(eventId) {
  window.location.href = `/web-proj1/event.html?id=${eventId}`;
}
