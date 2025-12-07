import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const switchToSignup = document.getElementById("switch-to-signup");
const switchToLogin = document.getElementById("switch-to-login");

function showLogin() {
  loginForm.classList.add("active");
  signupForm.classList.remove("active");
  loginTab.classList.add("active");
  signupTab.classList.remove("active");
}

function showSignup() {
  signupForm.classList.add("active");
  loginForm.classList.remove("active");
  signupTab.classList.add("active");
  loginTab.classList.remove("active");
}

loginTab.addEventListener("click", showLogin);
signupTab.addEventListener("click", showSignup);
switchToSignup.addEventListener("click", (e) => {
  e.preventDefault();
  showSignup();
});
switchToLogin.addEventListener("click", (e) => {
  e.preventDefault();
  showLogin();
});

// ========================================
// LOGIN HANDLER (Firebase)
// ========================================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const emailEl = document.getElementById("login-email");
  const passwordEl = document.getElementById("login-password");
  const errorEl = document.getElementById("login-error");

  errorEl.style.display = "none";
  errorEl.textContent = "";

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  // Client-side validation
  const clientErrors = [];
  if (!email) clientErrors.push("Email is required");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    clientErrors.push("Enter a valid email");
  if (!password) clientErrors.push("Password is required");

  if (clientErrors.length) {
    errorEl.textContent = clientErrors.join(".  ");
    errorEl.style.display = "block";
    return;
  }

  try {
    // Sign in with Firebase
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Get Firebase ID token
    const idToken = await user.getIdToken();

    // Sync with backend (optional - ensures user exists in your DB)
    await fetch("api/sync-user.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
      }),
    });

    // Redirect to account page
    window.location.href = "account.html";
  } catch (error) {
    console.error("Login error:", error);

    // User-friendly error messages
    let errorMessage = "Login failed";
    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/wrong-password"
    ) {
      errorMessage = "Invalid email or password";
    } else if (error.code === "auth/user-not-found") {
      errorMessage = "No account found with this email";
    } else if (error.code === "auth/too-many-requests") {
      errorMessage = "Too many failed attempts. Try again later.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    errorEl.textContent = errorMessage;
    errorEl.style.display = "block";
  }
});

// ========================================
// SIGNUP HANDLER (Firebase)
// ========================================
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameEl = document.getElementById("fullname");
  const ageEl = document.getElementById("age");
  const phoneEl = document.getElementById("signup-phone");
  const locationEl = document.getElementById("signup-location");
  const emailEl = document.getElementById("signup-email");
  const passwordEl = document.getElementById("signup-password");
  const confirmEl = document.getElementById("confirm-password");
  const errorEl = document.getElementById("signup-error");

  errorEl.style.display = "none";
  errorEl.textContent = "";

  const name = nameEl.value.trim();
  const age = ageEl.value.trim();
  const phone = phoneEl.value.trim();
  const location = locationEl.value.trim();
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  const confirm = confirmEl.value;

  // Client-side validation
  const clientErrors = [];
  if (!name) clientErrors.push("Name is required");
  if (!email) clientErrors.push("Email is required");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    clientErrors.push("Enter a valid email");
  if (!password) clientErrors.push("Password is required");
  else if (password.length < 6)
    clientErrors.push("Password must be at least 6 characters");
  if (password !== confirm) clientErrors.push("Passwords do not match");
  if (!age || isNaN(age) || parseInt(age, 10) < 13)
    clientErrors.push("Age must be at least 13");

  // Phone must start with + and include 7-15 digits
  const phoneDigits = phone.replace(/\D+/g, "");
  if (!phone) {
    clientErrors.push("Phone is required");
  } else if (!phone.startsWith("+")) {
    clientErrors.push("Phone must start with + and country code");
  } else if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    clientErrors.push("Phone must include 7-15 digits");
  }

  if (!location) {
    clientErrors.push("Location is required");
  } else if (!/[A-Za-z]/.test(location)) {
    clientErrors.push("Location must include letters (e.g., City, Country)");
  }

  if (clientErrors.length) {
    errorEl.textContent = clientErrors.join(". ");
    errorEl.style.display = "block";
    return;
  }

  try {
    // Create user in Firebase
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Get Firebase ID token
    const idToken = await user.getIdToken();

    // Send additional user data to backend
    await fetch("api/sync-user.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        name: name,
        age: parseInt(age, 10),
        phone: phone,
        location: location,
      }),
    });

    // Redirect to account page
    window.location.href = "account.html";
  } catch (error) {
    console.error("Signup error:", error);

    // User-friendly error messages
    let errorMessage = "Registration failed";
    if (error.code === "auth/email-already-in-use") {
      errorMessage = "Email already registered";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Password is too weak";
    } else if (error.message) {
      errorMessage = error.message;
    }

    errorEl.textContent = errorMessage;
    errorEl.style.display = "block";
  }
});
