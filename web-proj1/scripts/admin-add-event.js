// scripts/admin-add-event.js

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;

// DOM
const form = document.getElementById("add-event-form");
const genreSelection = document.getElementById("genre-selection");
const alertBox = document.getElementById("form-alert");
const submitBtn = document.getElementById("submit-btn");
const imageFileInput = document.getElementById("image_file");
const imagePreviewWrapper = document.getElementById("image-preview-wrapper");
const imagePreview = document.getElementById("image-preview");

// Alerts
function showAlert(msg, type = "info") {
  if (!alertBox) return console.log("ALERT:", msg);
  alertBox.textContent = msg;
  alertBox.className = msg ? `alert alert-${type}` : "";
}

function toggleSubmit(state) {
  submitBtn.disabled = state;
  submitBtn.textContent = state ? "Creating..." : "Add Event";
}

// Image Preview
function updatePreview(url) {
  if (!url) {
    imagePreviewWrapper.style.display = "none";
    imagePreview.src = "";
    return;
  }
  imagePreviewWrapper.style.display = "block";
  imagePreview.src = url;
}

// Load genres
async function loadGenres() {
  const res = await fetch("api/genres.php");
  const data = await res.json();

  genreSelection.innerHTML = "";
  data.genres.forEach(g => {
    const label = document.createElement("label");
    label.classList.add("genre-option");

    label.innerHTML = `
      <input type="checkbox" value="${g.id}" name="genres[]">
      <span>${g.name}</span>
    `;

    genreSelection.appendChild(label);
  });
}

// Upload image
async function uploadImageFile(file) {
  if (!file || !currentUser) return null;

  showAlert("Uploading image…");

  const fd = new FormData();
  fd.append("image", file);

  const res = await fetch("api/upload-image.php", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
      "X-Firebase-UID": currentUser.uid
    },
    body: fd
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);

  return data.url;
}

// Submit form
async function handleSubmit(e) {
  e.preventDefault();
  toggleSubmit(true);
  showAlert("");

  try {
    const payload = {
      name: document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      date: document.getElementById("date").value,
      time: document.getElementById("time").value,
      location: document.getElementById("location").value.trim(),
      price: Number(document.getElementById("price").value || 0),
      genres: Array.from(document.querySelectorAll('input[name="genres[]"]:checked')).map(cb => Number(cb.value)),
    };

    if (imageFileInput.files[0]) {
      payload.image_url = await uploadImageFile(imageFileInput.files[0]);
      updatePreview(payload.image_url);
    }

    const res = await fetch("api/admin/events.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await currentUser.getIdToken()}`,
        "X-Firebase-UID": currentUser.uid
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showAlert("Event created!", "success");
    form.reset();
    updatePreview("");

  } catch (err) {
    showAlert(err.message, "error");
  } finally {
    toggleSubmit(false);
  }
}

// Init
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = "login.html");
  currentUser = user;

  await loadGenres();
});

form.addEventListener("submit", handleSubmit);

imageFileInput.addEventListener("change", async (e) => {
  try {
    const url = await uploadImageFile(e.target.files[0]);
    updatePreview(url);
    showAlert("Image uploaded!", "success");
  } catch (err) {
    updatePreview("");
    showAlert(err.message, "error");
  }
});
