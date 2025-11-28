// Backend API base URL (aynı origin ise boş bırakabilirsin)
const API_BASE = "";

// Backend'ten gelen fiyat konfigürasyonu
let PRICING = {
  basePrice: 0,
  perKm: 0
};

async function loadPricing() {
  try {
    const res = await fetch("/api/config/pricing");
    if (!res.ok) {
      console.warn("Pricing config alınamadı, default değerler kullanılacak.");
      return;
    }
    const data = await res.json();
    if (typeof data.basePrice === "number") PRICING.basePrice = data.basePrice;
    if (typeof data.pricePerKm === "number") PRICING.perKm = data.pricePerKm;

    console.log("Pricing config yüklendi:", PRICING);
  } catch (err) {
    console.warn("Pricing config hata:", err);
  }
}

// Sayfa yüklenince pricing config'i çek
loadPricing();


// Leaflet harita
const map = L.map("map").setView([41.015137, 28.97953], 11); // İstanbul

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap katkıda bulunanlar",
}).addTo(map);

let fromMarker = null;
let toMarker = null;
let routeLine = null;
let lastReservationData = null;

// Kullanıcının konumuna zoom (sayfa ilk açıldığında)
let currentLocationMarker = null;

if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      // Haritayı kullanıcının konumuna yakınlaştır
      map.setView([lat, lon], 14);

      // Kullanıcının konumuna marker koy
      currentLocationMarker = L.marker([lat, lon], {
        title: "Şu anki konumun",
      }).addTo(map);
    },
    (err) => {
      console.warn("Geolocation hatası:", err.message);
      // Hata olursa zaten default İstanbul görünümünde kalır
    },
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    }
  );
} else {
  console.warn("Bu tarayıcı geolocation desteklemiyor.");
}


// autocomplete için seçilen değerler
let selectedFrom = null;
let selectedTo = null;

// autocomplete debounce timer’ları
let fromAutocompleteTimer = null;
let toAutocompleteTimer = null;

const statusEl = document.getElementById("status");
const routeInfoEl = document.getElementById("routeInfo");
const btnCalculate = document.getElementById("btnCalculate");
const btnSave = document.getElementById("btnSave");

const fromAddressInput = document.getElementById("fromAddress");
const toAddressInput = document.getElementById("toAddress");
const phoneInput = document.getElementById("phone");

function calculatePrice(distanceKm) {
  const basePrice = PRICING.basePrice;
  const perKm = PRICING.perKm;
  const price = basePrice + distanceKm * perKm;
  return Math.round(price * 100) / 100;
}

// Nominatim ile geocode (tek sonuç için)
async function geocode(address) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=tr&q=" +
    encodeURIComponent(address);

  const res = await fetch(url, {
    headers: { "Accept-Language": "tr" },
  });
  if (!res.ok) throw new Error("Geocoding isteği başarısız oldu.");

  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error("Adres bulunamadı: " + address);
  }

  const item = data[0];
  return {
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    displayName: item.display_name,
  };
}

// Nominatim ile autocomplete (çoklu sonuç)
async function searchPlaces(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&countrycodes=tr&q=" +
    encodeURIComponent(query);

  const res = await fetch(url, {
    headers: { "Accept-Language": "tr" },
  });
  if (!res.ok) throw new Error("Autocomplete isteği başarısız oldu.");

  const data = await res.json();
  return data.map((item) => ({
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    displayName: item.display_name,
    label: item.name + ", " + item.address.province,
  }));
}

// Öneride gösterilecek kısa label
function buildShortLabel(item) {
  const addr = item.address || {};
  // Yol + İlçe + Şehir gibi
  const parts = [
    addr.road,
    addr.suburb || addr.neighbourhood,
    addr.city || addr.town || addr.village,
  ].filter(Boolean);

  if (parts.length) return parts.join(", ");
  return item.display_name;
}

// OSRM ile rota ve mesafe
async function getRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Rota isteği başarısız oldu.");

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error("Rota bulunamadı.");
  }

  const route = data.routes[0];
  const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
  const distanceMeters = route.distance;
  const durationSeconds = route.duration;

  return {
    coords,
    distanceKm: distanceMeters / 1000,
    durationMinutes: Math.round(durationSeconds / 60),
  };
}

function updateMap(from, to, route) {
  if (fromMarker) map.removeLayer(fromMarker);
  if (toMarker) map.removeLayer(toMarker);
  if (routeLine) map.removeLayer(routeLine);

  fromMarker = L.marker([from.lat, from.lon]).addTo(map);
  toMarker = L.marker([to.lat, to.lon]).addTo(map);

  routeLine = L.polyline(route.coords, { weight: 5 }).addTo(map);
  const bounds = routeLine.getBounds();
  map.fitBounds(bounds, { padding: [20, 20] });
}

function setStatus(message, type = "info") {
  statusEl.textContent = message || "";
  statusEl.className = "info";
  if (type === "error") statusEl.classList.add("error");
  if (type === "success") statusEl.classList.add("success");
}

// i18n destekli status helper
function setStatusKey(key, type = "info") {
  setStatus(t(key), type);
}

/* ---------------------- AUTOCOMPLETE ---------------------- */

function createAutocompleteContainer(inputEl) {
  // aynı form-group içinde bir autocomplete-list var mı kontrol et
  const parent = inputEl.parentElement;
  let list = parent.querySelector(".autocomplete-list");
  if (!list) {
    list = document.createElement("div");
    list.className = "autocomplete-list";
    parent.appendChild(list);
  }
  return list;
}

function clearAutocomplete(inputEl) {
  const parent = inputEl.parentElement;
  const list = parent.querySelector(".autocomplete-list");
  if (list) {
    list.innerHTML = "";
    list.style.display = "none";
  }
}

function showAutocomplete(inputEl, items, onSelect) {
  const list = createAutocompleteContainer(inputEl);

  if (!items.length) {
    list.innerHTML = `<div class="autocomplete-empty">${t("autocomplete.noResults")}</div>`;
    list.style.display = "block";
    return;
  }

  list.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = item.label;
    div.title = item.displayName;
    div.addEventListener("click", () => {
      inputEl.value = item.label;
      clearAutocomplete(inputEl);
      onSelect(item);
    });
    list.appendChild(div);
  });

  list.style.display = "block";
}

function setupAutocomplete(inputEl, type) {
  inputEl.addEventListener("input", () => {
    const query = inputEl.value.trim();
    // Kullanıcı input değiştirince seçili olanı sıfırla
    if (type === "from") selectedFrom = null;
    if (type === "to") selectedTo = null;

    clearAutocomplete(inputEl);

    if (query.length < 3) {
      // çok kısa, API çağırmayalım
      return;
    }

    // debounce
    if (type === "from") {
      if (fromAutocompleteTimer) clearTimeout(fromAutocompleteTimer);
      fromAutocompleteTimer = setTimeout(() => {
        runAutocomplete(inputEl, query, type);
      }, 400);
    } else {
      if (toAutocompleteTimer) clearTimeout(toAutocompleteTimer);
      toAutocompleteTimer = setTimeout(() => {
        runAutocomplete(inputEl, query, type);
      }, 400);
    }
  });

  // focus dışına çıkınca listeyi kapat (küçük bir timeout ile)
  inputEl.addEventListener("blur", () => {
    setTimeout(() => clearAutocomplete(inputEl), 200);
  });
}

async function runAutocomplete(inputEl, query, type) {
  try {
    const results = await searchPlaces(query);
    showAutocomplete(inputEl, results, (item) => {
      const data = {
        lat: item.lat,
        lon: item.lon,
        displayName: item.displayName,
        label: item.label,
        query: inputEl.value.trim(),
      };
      if (type === "from") selectedFrom = data;
      if (type === "to") selectedTo = data;
    });
  } catch (err) {
    console.error("Autocomplete error:", err);
  }
}

// Autocomplete’i from/to için aktif et
setupAutocomplete(fromAddressInput, "from");
setupAutocomplete(toAddressInput, "to");

/* ------------------- ROTA & REZERVASYON ------------------- */

btnCalculate.addEventListener("click", async () => {
  const fromText = fromAddressInput.value.trim();
  const toText = toAddressInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!fromText || !toText) {
    setStatusKey("status.fillFromTo", "error");
    return;
  }

  setStatusKey("status.routeCalculating", "info");
  routeInfoEl.textContent = "";
  btnCalculate.disabled = true;
  btnSave.disabled = true;
  lastReservationData = null;

  try {
    let from, to;

    // Eğer autocomplete ile seçim yapıldıysa onu kullan
    if (selectedFrom && selectedFrom.query === fromText) {
      from = {
        lat: selectedFrom.lat,
        lon: selectedFrom.lon,
        displayName: selectedFrom.displayName,
      };
    } else {
      from = await geocode(fromText);
    }

    if (selectedTo && selectedTo.query === toText) {
      to = {
        lat: selectedTo.lat,
        lon: selectedTo.lon,
        displayName: selectedTo.displayName,
      };
    } else {
      to = await geocode(toText);
    }

    const route = await getRoute(from, to);

    const distanceKm = route.distanceKm;
    const durationMinutes = route.durationMinutes;
    const price = calculatePrice(distanceKm);

    updateMap(from, to, route);

    routeInfoEl.innerHTML = `
      <div>
        <strong>${t("route.distanceLabel")}</strong> ${distanceKm.toFixed(1)} ${t("route.kmUnit")}<br/>
        <strong>${t("route.durationLabel")}</strong> ~${durationMinutes} ${t("route.minutesUnit")}<br/>
        <strong>${t("route.priceLabel")}</strong> ${price.toFixed(2)} ${t("route.currency")}
      </div>
    `;

    lastReservationData = {
      fromAddress: fromText,
      fromFull: from.displayName,
      toAddress: toText,
      toFull: to.displayName,
      distanceKm,
      durationMinutes,
      price,
      phone,
      createdAt: new Date().toISOString(),
    };

    setStatusKey("status.routeReady", "success");
    btnSave.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(err.message || t("status.errorGeneric"), "error");
  } finally {
    btnCalculate.disabled = false;
  }
});

btnSave.addEventListener("click", async () => {
  if (!lastReservationData) {
    setStatusKey("status.calculateFirst", "error");
    return;
  }

  const phone = phoneInput.value.trim();
  if (!phone) {
    setStatusKey("status.enterPhone", "error");
    return;
  }

  lastReservationData.phone = phone;

  try {
    setStatusKey("status.reservationSaving", "info");
    btnSave.disabled = true;

    const res = await fetch(`${API_BASE}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastReservationData),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(t("status.serverErrorPrefix") + " " + res.status + " " + text);
    }

    const data = await res.json();
    if (data.success) {
      setStatusKey("status.reservationSaved", "success");
    } else {
      setStatusKey("status.reservationFailed", "error");
    }
  } catch (err) {
    console.error(err);
    setStatus(t("status.reservationSaveErrorPrefix") + " " + err.message, "error");
  } finally {
    btnSave.disabled = false;
  }
});
