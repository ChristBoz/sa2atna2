// scripts/admin-edit-event.js
import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let events = [];
let selectedEventId = null;
let currentImageUrl = null;
let genresList = [];

// DOM refs
const alertBox = document.getElementById("form-alert");
const eventsGrid = document.getElementById("events-grid");
const noEvents = document.getElementById("no-events");
const editFormSection = document.getElementById("edit-form");
const editSubtitle = document.getElementById("edit-subtitle");
const form = document.getElementById("edit-event-form");
const submitBtn = document.getElementById("submit-btn");
const deleteBtn = document.getElementById("delete-btn");
const cancelBtn = document.getElementById("cancel-btn");

const titleInput = document.getElementById("title");
const descInput = document.getElementById("description");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");
const locationInput = document.getElementById("location");
const priceInput = document.getElementById("price");
const genreSelection = document.getElementById("genre-selection");

const imageFileInput = document.getElementById("image_file");
const imagePreviewWrapper = document.getElementById("image-preview-wrapper");
const imagePreview = document.getElementById("image-preview");

// ---------- helpers ----------
function showAlert(message, type = "info") {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = message ? `alert ${type}` : "alert";
  alertBox.style.display = message ? "block" : "none";
}

function toggleSubmit(disabled) {
  if (!submitBtn) return;
  submitBtn.disabled = disabled;
  submitBtn.textContent = disabled ? "Saving..." : "Save Changes";
}

function toggleDelete(disabled) {
  if (!deleteBtn) return;
  deleteBtn.disabled = disabled;
  deleteBtn.textContent = disabled ? "Deleting..." : "Delete Event";
}

function updatePreview(url) {
  if (!imagePreviewWrapper || !imagePreview) return;
  if (!url) {
    imagePreviewWrapper.style.display = "none";
    imagePreview.src = "";
    return;
  }
  imagePreviewWrapper.style.display = "block";
  imagePreview.src = url;
}

function getEventIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("id");
  const parsed = raw ? Number(raw) : null;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDateForInput(dateStr) {
  if (!dateStr) return "";

  const normalized = dateStr.slice(0, 10);
  const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  if (!isValidFormat || normalized === "0000-00-00") return "";

  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : normalized;
}

async function ensureAdmin(user) {
  const idToken = await user.getIdToken();
  const res = await fetch("api/me.php", {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to load user profile");
  }

  const role = data.user.role;
  if (role !== "admin" && role !== "owner") {
    throw new Error("You are not authorized to access this page.");
  }

  return true;
}

// ---------- UI rendering ----------
function renderEventsGrid() {
  console.log(`Rendering events grid with ${events.length} events`);
  eventsGrid.innerHTML = "";

  if (!events.length) {
    console.log("No events to render, showing empty state");
    selectedEventId = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState({}, "", url);

    noEvents.style.display = "block";
    editFormSection.classList.remove("active");
    return;
  }

  noEvents.style.display = "none";
  console.log("Rendering event cards...");

  events.forEach((ev) => {
    const card = document.createElement("article");
    card.className = "event-card" + (ev.id === selectedEventId ? " selected" : "");

    card.innerHTML = `
      <div class="event-card-header">
        <div>
          <h3 class="event-card-title">${ev.name || "Untitled"}</h3>
          <div class="event-card-info">${ev.location || "Unknown location"}</div>
        </div>
      </div>
      <div class="event-card-info">${ev.date || "No date"} at ${ev.time || "--"}</div>
      ${ev.genres?.length ? `<div class="event-genres">${ev.genres
        .map((g) => `<span class="genre-tag">${g}</span>`)
        .join("")}</div>` : ""}
    `;

    card.addEventListener("click", () => selectEvent(ev.id));
    eventsGrid.appendChild(card);
  });

  console.log(`Rendered ${eventsGrid.children.length} event cards`);
}

function setGenresSelection(selected) {
  const ids = new Set((selected || []).map((id) => Number(id)));
  document
    .querySelectorAll('input[name="genres[]"]')
    .forEach((cb) => (cb.checked = ids.has(Number(cb.value))));
}

function populateForm(ev) {
  console.log("Populating form with event data:", ev);
  titleInput.value = ev.name || "";
  descInput.value = ev.description || "";
  dateInput.value = normalizeDateForInput(ev.date);
  timeInput.value = ev.time || "";
  locationInput.value = ev.location || "";
  priceInput.value = ev.price ?? "";
  // Only primary genre is available from API, so preselect that one
  const selectedGenres = ev.genre_id ? [Number(ev.genre_id)] : [];
  setGenresSelection(selectedGenres);

  currentImageUrl = ev.image_url || null;
  updatePreview(currentImageUrl);

  editSubtitle.textContent = ev.name ? `Editing: ${ev.name}` : "Editing event";
  editFormSection.classList.add("active");
  console.log("Form populated and made visible");
}

// ---------- data loading ----------
async function loadGenres() {
  genreSelection.innerHTML = "Loading genres...";
  const res = await fetch("api/genres.php");
  const data = await res.json();

  genresList = data.genres || [];
  genreSelection.innerHTML = "";

  genresList.forEach((g) => {
    const label = document.createElement("label");
    label.classList.add("genre-option");
    label.innerHTML = `
      <input type="checkbox" value="${g.id}" name="genres[]" />
      <span>${g.name}</span>
    `;
    genreSelection.appendChild(label);
  });
}

async function loadEvents() {
  console.log("Loading events...");
  
  // Show loading state
  if (eventsGrid) {
    const loadingDiv = document.createElement('div');
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.padding = '20px';
    loadingDiv.style.color = '#6b7280';
    loadingDiv.textContent = 'Loading events...';
    eventsGrid.innerHTML = '';
    eventsGrid.appendChild(loadingDiv);
  }

  try {
    const res = await fetch("api/admin/events.php", {
      headers: {
        Authorization: `Bearer ${await currentUser.getIdToken()}`,
        "X-Firebase-UID": currentUser.uid,
      },
    });

    console.log("Events API response status:", res.status);
    
    const data = await res.json();
    console.log("Events API response data:", data);
    
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Failed to load events");
    }

    events = data.events || [];
    console.log(`Loaded ${events.length} events`);
    
    renderEventsGrid();

    const fromUrl = getEventIdFromUrl();
    const matched = fromUrl ? events.find((e) => e.id === fromUrl) : null;

    if (matched) {
      console.log(`Selecting event from URL: ${fromUrl}`);
      selectEvent(matched.id);
    } else if (events.length > 0) {
      console.log(`Selecting first event: ${events[0].id}`);
      selectEvent(events[0].id);
    } else {
      console.log("No events available");
      showAlert("No events available to edit. Create one first.", "info");
    }
  } catch (error) {
    console.error("Error loading events:", error);
    if (eventsGrid) {
      eventsGrid.innerHTML = '';
      const errorDiv = document.createElement('div');
      errorDiv.style.textAlign = 'center';
      errorDiv.style.padding = '20px';
      errorDiv.style.color = '#ef4444';
      
      const errorTitle = document.createElement('p');
      errorTitle.textContent = 'Failed to load events';
      errorDiv.appendChild(errorTitle);
      
      const errorMsg = document.createElement('p');
      errorMsg.style.fontSize = '0.9rem';
      errorMsg.style.color = '#6b7280';
      errorMsg.textContent = error.message; // Safe: textContent automatically escapes
      errorDiv.appendChild(errorMsg);
      
      eventsGrid.appendChild(errorDiv);
    }
    throw error;
  }
}

// ---------- API helpers ----------
async function uploadImageFile(file) {
  if (!file || !currentUser) return null;
  showAlert("Uploading image...", "info");

  const idToken = await currentUser.getIdToken();
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("api/upload-image.php", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "X-Firebase-UID": currentUser.uid,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Image upload failed");
  }

  return data.url;
}

async function selectEvent(eventId) {
  console.log(`Attempting to select event: ${eventId}`);
  const match = events.find((e) => e.id === Number(eventId));
  if (!match) {
    console.warn(`Event ${eventId} not found in events array`);
    showAlert("Missing ?id= in URL for event. Showing the first available event.", "info");
    if (events[0]) {
      return selectEvent(events[0].id);
    }
    return;
  }

  selectedEventId = Number(eventId);
  console.log(`Selected event: ${selectedEventId} - ${match.name}`);
  
  const url = new URL(window.location.href);
  url.searchParams.set("id", selectedEventId);
  window.history.replaceState({}, "", url);

  renderEventsGrid();
  populateForm(match);
  showAlert("");
}

// ---------- submit handling ----------
async function handleSubmit(e) {
  e.preventDefault();
  if (!selectedEventId) {
    showAlert("Select an event to edit.", "error");
    return;
  }

  const name = titleInput.value.trim();
  const description = descInput.value.trim();
  const date = dateInput.value;
  const time = timeInput.value;
  const location = locationInput.value.trim();

  if (!name || !description || !date || !time || !location) {
    showAlert("Please fill in all required fields.", "error");
    return;
  }

  toggleSubmit(true);
  try {
    const file = imageFileInput.files[0];
    let imageUrl = currentImageUrl;
    if (file) {
      imageUrl = await uploadImageFile(file);
      currentImageUrl = imageUrl;
      updatePreview(imageUrl);
    }

    const genresSelected = Array.from(
      document.querySelectorAll('input[name="genres[]"]:checked')
    ).map((cb) => Number(cb.value));

    const payload = {
      name,
      description,
      date,
      time,
      location,
      price: priceInput.value ? Number(priceInput.value) : 0,
      genres: genresSelected,
      image_url: imageUrl,
    };

    const res = await fetch(`api/admin/events.php?id=${selectedEventId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await currentUser.getIdToken()}`,
        "X-Firebase-UID": currentUser.uid,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Update failed");
    }

    showAlert("Event updated successfully!", "success");
    await loadEvents();
    selectEvent(selectedEventId);
  } catch (err) {
    console.error("Edit event error:", err);
    showAlert(err.message, "error");
  } finally {
    toggleSubmit(false);
  }
}

function handleCancel() {
  if (selectedEventId) {
    selectEvent(selectedEventId);
  }
}

async function handleDelete() {
  if (!selectedEventId) {
    showAlert("Select an event to delete.", "error");
    return;
  }

  const confirmDelete = window.confirm(
    "Are you sure you want to delete this event? This cannot be undone."
  );
  if (!confirmDelete) return;

  toggleDelete(true);
  if (submitBtn) submitBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    const res = await fetch(`api/admin/events.php?id=${selectedEventId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${await currentUser.getIdToken()}`,
        "X-Firebase-UID": currentUser.uid,
      },
    });

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Delete failed");
    }

    showAlert("Event deleted successfully.", "success");
    await loadEvents();
  } catch (err) {
    console.error("Delete event error:", err);
    showAlert(err.message, "error");
  } finally {
    toggleDelete(false);
    if (submitBtn) submitBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

// ---------- init ----------
function init() {
  console.log("Initializing edit-event page");
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.log("No user logged in, redirecting to login");
      window.location.href = "login.html";
      return;
    }

    console.log("User authenticated:", user.uid);
    currentUser = user;
    try {
      console.log("Checking admin permissions...");
      await ensureAdmin(user);
      console.log("Admin permissions verified");
      
      console.log("Loading genres...");
      await loadGenres();
      console.log("Genres loaded");
      
      console.log("Loading events...");
      await loadEvents();
      console.log("Events loaded and displayed");
    } catch (err) {
      console.error("Error initializing edit page:", err);
      alert(err.message || "Unable to load event.");
      window.location.href = "admin.html";
    }
  });

  if (form) form.addEventListener("submit", handleSubmit);
  if (cancelBtn) cancelBtn.addEventListener("click", handleCancel);
  if (deleteBtn) deleteBtn.addEventListener("click", handleDelete);
  if (imageFileInput) {
    imageFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await uploadImageFile(file);
        currentImageUrl = url;
        updatePreview(url);
        showAlert("Image uploaded successfully.", "success");
      } catch (err) {
        console.error("Image upload error:", err);
        showAlert("Image upload failed: " + err.message, "error");
        updatePreview(currentImageUrl || "");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
