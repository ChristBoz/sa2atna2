const CACHE_KEY = "geoCacheV1";
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
