/**
 * Admin Authentication Helper
 * Checks user role and handles authentication for admin pages
 */

class AdminAuth {
  constructor() {
    this.currentUser = null;
    this.isAdmin = false;
    this.isOwner = false;
  }

  /**
   * Initialize and check authentication
   */
  async init() {
    // Check if Firebase user is logged in
    return new Promise((resolve, reject) => {
      firebase.auth().onAuthStateChanged(async (firebaseUser) => {
        if (!firebaseUser) {
          // Not logged in - redirect to login
          window.location.href = "/login.html";
          reject("Not authenticated");
          return;
        }

        try {
          // Get user data from our database
          const response = await fetch("/api/me.php", {
            headers: {
              "X-Firebase-UID": firebaseUser.uid,
            },
          });

          if (!response.ok) {
            throw new Error("Failed to fetch user data");
          }

          const data = await response.json();
          this.currentUser = data.user;

          // Check roles
          this.isAdmin = ["admin", "owner"].includes(this.currentUser.role);
          this.isOwner = this.currentUser.role === "owner";

          // Check if user has admin privileges
          if (!this.isAdmin) {
            alert("Access denied.  Admin privileges required.");
            window.location.href = "/index.html";
            reject("Not authorized");
            return;
          }

          resolve(this.currentUser);
        } catch (error) {
          console.error("Auth error:", error);
          alert("Authentication error. Please try logging in again.");
          window.location.href = "/login.html";
          reject(error);
        }
      });
    });
  }

  /**
   * Make authenticated API request
   */
  async apiRequest(url, options = {}) {
    const firebaseUser = firebase.auth().currentUser;
    if (!firebaseUser) {
      throw new Error("Not authenticated");
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Firebase-UID": firebaseUser.uid,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 || response.status === 403) {
      alert("Session expired or access denied. Please log in again.");
      window.location.href = "/login.html";
      throw new Error("Authentication failed");
    }

    return response;
  }

  /**
   * Show/hide elements based on role
   */
  updateUIForRole() {
    // Hide owner-only elements if not owner
    document.querySelectorAll("[data-require-owner]").forEach((el) => {
      el.style.display = this.isOwner ? "" : "none";
    });

    // Show admin name and role in UI
    const userNameEl = document.getElementById("admin-user-name");
    const userRoleEl = document.getElementById("admin-user-role");

    if (userNameEl && this.currentUser) {
      userNameEl.textContent = this.currentUser.name;
    }
    if (userRoleEl && this.currentUser) {
      userRoleEl.textContent = this.currentUser.role.toUpperCase();
      userRoleEl.className = `role-badge role-${this.currentUser.role}`;
    }
  }

  /**
   * Require owner role (redirect if not)
   */
  requireOwner() {
    if (!this.isOwner) {
      alert("Access denied. Owner privileges required.");
      window.location.href = "/admin.html";
      return false;
    }
    return true;
  }
}

// Global instance
const adminAuth = new AdminAuth();
