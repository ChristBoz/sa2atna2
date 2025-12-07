import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { geocodePlace } from "./geocode.js";

let allEvents = [];
let allGenres = [];
let userFavorites = [];
let currentUser = null;
let selectedGenre = "";

window.addEventListener("DOMContentLoaded", async () => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      await loadCurrentUser(firebaseUser);
      updateUIForLoggedIn();
      await loadFavorites();
    } else {
      updateUIForLoggedOut();
    }
  });

  await loadGenres();
  await loadEvents();
  setupEventListeners();
});

async function loadCurrentUser(firebaseUser) {
  try {
    const response = await fetch("/web-proj1/api/me.php", {
      headers: { "X-Firebase-UID": firebaseUser.uid },
    });
    const data = await response.json();
    if (data.user) currentUser = data.user;
  } catch (error) {
    console.error("Failed to load user:", error);
  }
}

function updateUIForLoggedIn() {
  document.getElementById("login-btn").style.display = "none";
  document.getElementById("user-menu").style.display = "block";
  document.getElementById("favorites-link").style.display = "block";
  document.getElementById("registrations-link").style.display = "block";
  document.getElementById("profile-link").style.display = "block";
  const userMenu = document.getElementById("user-menu");
  if (userMenu) {
    userMenu.style.cursor = "pointer";
    userMenu.onclick = () => {
      window.location.href = "account.html";
    };
  }
  if (currentUser) {
    const avatar = document.getElementById("user-avatar");
    avatar.textContent = currentUser.name
      ? currentUser.name.charAt(0).toUpperCase()
      : "U";
    if (["admin", "owner"].includes(currentUser.role)) {
      document.getElementById("admin-link").style.display = "block";
      document.getElementById("admin-badge").style.display = "block";
    }
  }
}

function updateUIForLoggedOut() {
  document.getElementById("login-btn").style.display = "block";
  document.getElementById("user-menu").style.display = "none";
  document.getElementById("favorites-link").style.display = "none";
  document.getElementById("registrations-link").style.display = "none";
  document.getElementById("profile-link").style.display = "none";
  document.getElementById("admin-link").style.display = "none";
  const userMenu = document.getElementById("user-menu");
  if (userMenu) userMenu.onclick = null;
}

// Load genres from API
async function loadGenres() {
  try {
    const response = await fetch("api/genres.php");
    const data = await response.json();
    if (data.success) {
      allGenres = data.genres;
      renderGenreFilters();
    }
  } catch (error) {
    console.error("Failed to load genres:", error);
  }
}

// Render genre chips (text-only, no emojis)
function renderGenreFilters() {
  const container = document.getElementById("genre-filters");
  container.innerHTML = "";

  // "All Events" chip (text-only)
  const allChip = document.createElement("div");
  allChip.className = "genre-chip active";
  allChip.dataset.genre = "";
  allChip.textContent = "All Events";
  allChip.addEventListener("click", () => {
    selectGenre("");
  });
  container.appendChild(allChip);

  allGenres.forEach((genre) => {
    const chip = document.createElement("div");
    chip.className = "genre-chip";
    chip.dataset.genre = genre.slug || genre.name;
    // text-only rendering
    const labelSpan = document.createElement("span");
    labelSpan.textContent = genre.name;
    chip.appendChild(labelSpan);

    chip.addEventListener("click", () => {
      selectGenre(genre.slug || genre.name);
    });
    container.appendChild(chip);
  });
}

// Select genre, update UI, reload events
function selectGenre(genreSlug) {
  selectedGenre = genreSlug || "";

  document.querySelectorAll(".genre-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.genre === selectedGenre);
  });

  const heading = document.getElementById("events-heading");
  if (selectedGenre) {
    const genre = allGenres.find(
      (g) => g.slug === selectedGenre || g.name === selectedGenre
    );
    heading.textContent = `${genre ? genre.name : selectedGenre} Events`;
  } else {
    heading.textContent = "All Events";
  }

  loadEvents();
}

// Create event card element (no emoji/icon output)
function createEventCard(event) {
  const card = document.createElement("div");
  card.className = "event-card";

  const title = event.name || event.title || "Untitled Event";
  const location = event.location || "Location TBA";
  const date = event.date || "TBA";
  const time = event.time ? `• ${event.time}` : "";
  const price =
    event.price && parseFloat(event.price) > 0
      ? `$${parseFloat(event.price).toFixed(2)}`
      : "FREE";
  const isFavorited = userFavorites.includes(Number(event.id));
  const imageUrl =
    event.image_url || "https://placehold.co/400x200/667eea/white?text=Event";

  // build DOM safely (no innerHTML with emojis)
  const preview = document.createElement("div");
  preview.className = "event-preview";
  const img = document.createElement("img");
  img.className = "event-image";
  img.src = imageUrl;
  img.alt = title;
  img.onerror = function () {
    this.src = "https://placehold.co/400x200/667eea/white?text=Event";
  };
  const priceSpan = document.createElement("span");
  priceSpan.className = "event-price";
  priceSpan.textContent = price;
  preview.appendChild(img);
  preview.appendChild(priceSpan);

  const h4 = document.createElement("h4");
  h4.textContent = title;

  const infoP = document.createElement("p");
  infoP.className = "event-info";
  infoP.textContent = `${location} • ${date} ${time}`;

  const genresDiv = document.createElement("div");
  genresDiv.className = "event-genres";
  if (event.genre_name) {
    const tag = document.createElement("span");
    tag.className = "event-genre-tag";
    tag.textContent = event.genre_name;
    genresDiv.appendChild(tag);
  }

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "card-actions";
  const detailsBtn = document.createElement("button");
  detailsBtn.className = "details-btn";
  detailsBtn.dataset.id = event.id;
  detailsBtn.textContent = "View Details";
  detailsBtn.addEventListener("click", () => window.viewEventDetails(event.id));

  const favBtn = document.createElement("button");
  favBtn.className = "favorite-btn";
  if (isFavorited) favBtn.classList.add("favorited");
  favBtn.dataset.id = event.id;
  favBtn.disabled = !currentUser;
  favBtn.textContent = isFavorited ? "❤️ Favorited" : "♡ Add to Favorites";
  favBtn.addEventListener("click", () => window.toggleFavorite(event.id));

  actionsDiv.appendChild(detailsBtn);
  actionsDiv.appendChild(favBtn);

  // append children
  card.appendChild(preview);
  card.appendChild(h4);
  card.appendChild(infoP);
  card.appendChild(genresDiv);
  card.appendChild(actionsDiv);

  return card;
}

// Load events (with filters)
async function loadEvents() {
  const container = document.getElementById("events-container");
  container.innerHTML =
    '<div class="loading-spinner"><p>⏳ Loading events...</p></div>';

  try {
    const params = new URLSearchParams();
    if (selectedGenre) params.append("genre", selectedGenre);

    const date = document.getElementById("filter-date")?.value;
    if (date) {
      params.append("date_from", date); // Changed from "date"
      params.append("date_to", date); // Add this for single-day filtering
    }

    const price = document.getElementById("filter-price")?.value;
    if (price) params.append("price_max", price); // Changed from "max_price"

    const sort = document.getElementById("filter-sort")?.value;
    if (sort) params.append("sort", sort);

    const response = await fetch(
      `/web-proj1/api/events.php?${params.toString()}`
    );
    const data = await response.json();

    if (data.success) {
      allEvents = data.events;
      renderEvents();
    } else {
      throw new Error(data.error || "Failed to load events");
    }
  } catch (error) {
    console.error("Failed to load events:", error);
    container.innerHTML = `
          <div class="no-events">
            <h3>😕 Unable to load events</h3>
            <p>${error.message || "Please try again later"}</p>
          </div>
        `;
  }
}

function renderEvents() {
  const container = document.getElementById("events-container");
  if (!allEvents.length) {
    container.innerHTML =
      '<div class="no-events"><h3>😕 No events found</h3><p>Try adjusting your search or filters</p></div>';
    return;
  }

  container.innerHTML = "";
  allEvents.forEach((event) => container.appendChild(createEventCard(event)));
}

// Load favorites
async function loadFavorites() {
  try {
    const firebaseUser = auth.currentUser;
    const response = await fetch("/web-proj1/api/favorites.php", {
      headers: { "X-Firebase-UID": firebaseUser.uid },
    });
    const data = await response.json();
    if (data.success) userFavorites = data.favorites.map((f) => Number(f.id));
  } catch (error) {
    console.error("Failed to load favorites:", error);
  }
}

// Toggle favorite (optimistic + logging)
window.toggleFavorite = async function (eventId) {
  if (!currentUser) {
    alert("Please log in to add favorites");
    return;
  }
  const fid = Number(eventId);
  const isFavorited = userFavorites.includes(fid);

  // optimistic update
  if (!isFavorited) userFavorites.push(fid);
  else userFavorites = userFavorites.filter((id) => id !== fid);
  renderEvents();

  try {
    const firebaseUser = auth.currentUser;
    const resp = await fetch(
      "/web-proj1/api/favorites.php" + (isFavorited ? `?event_id=${fid}` : ""),
      {
        method: isFavorited ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firebase-UID": firebaseUser.uid,
        },
        body: isFavorited ? null : JSON.stringify({ event_id: fid }),
      }
    );
    const data = await resp.json();
    console.log("toggleFavorite response", resp.status, data);
    if (!resp.ok || !data.success) {
      // revert
      if (!isFavorited)
        userFavorites = userFavorites.filter((id) => id !== fid);
      else userFavorites.push(fid);
      renderEvents();
      alert("Failed to update favorite: " + (data.error || resp.status));
    }
  } catch (err) {
    console.error("toggleFavorite error", err);
    // revert
    if (!isFavorited) userFavorites = userFavorites.filter((id) => id !== fid);
    else userFavorites.push(fid);
    renderEvents();
    alert("Network error while updating favorite");
  }
};

// View event details
window.viewEventDetails = function (eventId) {
  window.location.href = `/web-proj1/event.html?id=${eventId}`;
};

// Search (renders filtered view, doesn't overwrite allEvents)
function searchEvents() {
  const q1 = document.getElementById("search-input")?.value || "";
  const q2 = document.getElementById("header-search")?.value || "";
  const query = (q1 || q2).trim();

  if (!query) {
    renderEvents();
    return;
  }

  const filtered = allEvents.filter(
    (event) =>
      (event.name || event.title || "")
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      (event.description || "").toLowerCase().includes(query.toLowerCase()) ||
      (event.location || "").toLowerCase().includes(query.toLowerCase())
  );

  const container = document.getElementById("events-container");
  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="no-events"><h3>😕 No events found</h3><p>Try adjusting your search or filters</p></div>';
    return;
  }

  container.innerHTML = "";
  filtered.forEach((e) => container.appendChild(createEventCard(e)));
}

// Setup event listeners
function setupEventListeners() {
  document
    .getElementById("search-btn")
    ?.addEventListener("click", searchEvents);
  document
    .getElementById("header-search-btn")
    ?.addEventListener("click", searchEvents);
  document.getElementById("search-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchEvents();
  });
  document
    .getElementById("header-search")
    ?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchEvents();
    });

  const toggleBtn = document.getElementById("filter-toggle");
  const panel = document.getElementById("filter-panel");
  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      const open = panel.classList.contains("expanded");
      panel.classList.toggle("expanded", !open);
      panel.classList.toggle("collapsed", open);
      toggleBtn.innerText = open ? "Advanced Filters ▾" : "Advanced Filters ▴";
      toggleBtn.setAttribute("aria-expanded", (!open).toString());
    });
  }

  document.getElementById("filter-form").addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilters();
  });

  document
    .getElementById("clear-filters-btn")
    ?.addEventListener("click", () => {
      const form = document.getElementById("filter-form");
      if (form) form.reset();
      selectedGenre = "";
      document
        .querySelectorAll(".genre-chip")
        .forEach((ch) =>
          ch.classList.toggle("active", ch.dataset.genre === "")
        );
      loadEvents();
    });

  const genreSelect = document.getElementById("genreFilter");
  if (genreSelect) {
    genreSelect.addEventListener("change", (e) => {
      selectedGenre = e.target.value;
      loadEvents();
    });
  }
}

function applyFilters() {
  selectedGenre = selectedGenre || "";
  loadEvents();
}
