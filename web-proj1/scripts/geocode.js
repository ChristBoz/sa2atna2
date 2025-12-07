const CACHE_KEY = "geoCacheV1";
const USER_LOCATION_KEY = "userLocationV1";
const cache = loadCache();

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Unable to read geocode cache", err);
    return {};
  }
}

function persistCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn("Unable to save geocode cache", err);
  }
}

function normalizeKey(query) {
  return (query || "").trim().toLowerCase();
}

export function getCachedCoords(query) {
  const key = normalizeKey(query);
  return cache[key] || null;
}

export function rememberCoords(query, coords) {
  const key = normalizeKey(query);
  cache[key] = coords;
  persistCache();
}

export async function geocodePlace(query) {
  const key = normalizeKey(query);
  if (!key) throw new Error("Please enter a location");

  const cached = getCachedCoords(key);
  if (cached) return cached;

  const resp = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`
  );

  if (!resp.ok) {
    throw new Error("Geocoding request failed");
  }

  const results = await resp.json();
  if (!Array.isArray(results) || !results.length) {
    throw new Error("No results found for that place");
  }

  const first = results[0];
  const coords = { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
  rememberCoords(key, coords);
  return coords;
}

export function haversineDistanceKm(a, b) {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lng - a.lng);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c * 100) / 100;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

export function loadUserLocation() {
  try {
    const raw = localStorage.getItem(USER_LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Unable to read saved user location", err);
    return null;
  }
}

export function saveUserLocation(location) {
  try {
    localStorage.setItem(USER_LOCATION_KEY, JSON.stringify(location));
  } catch (err) {
    console.warn("Unable to save user location", err);
  }
}

export function clearUserLocation() {
  try {
    localStorage.removeItem(USER_LOCATION_KEY);
  } catch (err) {
    console.warn("Unable to clear user location", err);
  }
}
