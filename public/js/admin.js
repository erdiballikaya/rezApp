const API_BASE = "";

const loginCard = document.getElementById("loginCard");
const reservationsCard = document.getElementById("reservationsCard");
const loginStatus = document.getElementById("loginStatus");
const btnLogin = document.getElementById("btnLogin");
const btnRefresh = document.getElementById("btnRefresh");
const btnLogout = document.getElementById("btnLogout");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");
const tableContainer = document.getElementById("tableContainer");
const countBadge = document.getElementById("countBadge");

function setLoginStatus(message, type = "info") {
  loginStatus.textContent = message || "";
  loginStatus.className = "info";
  if (type === "error") loginStatus.classList.add("error");
  if (type === "success") loginStatus.classList.add("success");
}

function getToken() {
  return localStorage.getItem("adminToken");
}

function setToken(token) {
  if (!token) {
    localStorage.removeItem("adminToken");
  } else {
    localStorage.setItem("adminToken", token);
  }
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("tr-TR");
}

async function loadReservations() {
  const token = getToken();
  if (!token) return;

  try {
    btnRefresh.disabled = true;
    countBadge.textContent = "Yükleniyor...";
    tableContainer.innerHTML = "";

    const res = await fetch(`${API_BASE}/api/admin/reservations`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (res.status === 401) {
      setToken(null);
      showLogin();
      return;
    }

    if (!res.ok) throw new Error("Sunucu hatası: " + res.status);

    const list = await res.json();
    countBadge.textContent = `${list.length} kayıt`;

    if (!list.length) {
      tableContainer.innerHTML = `<div class="empty">Henüz rezervasyon yok.</div>`;
      return;
    }

    let html = `
  <div class="admin-table-container">
    <table>
      <thead>
        <tr>
          <th>Oluşturma Tarihi</th>
          <th>Client Tarihi</th>
          <th>Nereden</th>
          <th>Nereye</th>
          <th>Mesafe (km)</th>
          <th>Süre (dk)</th>
          <th>Fiyat (TL)</th>
          <th>Telefon</th>
          <th>Durum</th>
          <th>İşlem</th>
        </tr>
      </thead>
      <tbody>
`;

    for (const r of list) {
      const createdAt = formatDate(r.createdAt);
      const createdAtClient = r.createdAtClient ? formatDate(r.createdAtClient) : "-";
      const distance = r.distanceKm != null ? r.distanceKm.toFixed(1) : "-";
      const duration = r.durationMinutes ?? "-";
      const price = r.price != null ? r.price.toFixed(2) : "-";
      const phone = r.phone || "-";

      let statusText = "Beklemede";
      let rowClass = "row-pending";

      if (r.isApproved === true) {
        statusText = "Onaylandı";
        rowClass = "row-approved";
      } else if (r.isApproved === false) {
        statusText = "Reddedildi";
        rowClass = "row-rejected";
      }


      html += `
    <tr class="${rowClass}">
      <td>${createdAt}</td>
      <td>${createdAtClient}</td>
      <td>${r.fromAddress || "-"}</td>
      <td>${r.toAddress || "-"}</td>
      <td>${distance}</td>
      <td>${duration}</td>
      <td>${price}</td>
      <td class="col-phone">${phone !== "-" ? `<a href="tel:${phone}">${phone}</a>` : "-"}</td>
      <td>${statusText}</td>
      <td>
        <div class="table-actions">
          <button
            class="btn-table btn-approve"
            data-action="approve"
            data-id="${r._id}"
          >
            ✓
          </button>
          <button
            class="btn-table btn-reject"
            data-action="reject"
            data-id="${r._id}"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  `;

    }
    html += `
      </tbody>
    </table>
    <div class="status-legend">
      <span class="legend-item legend-approved">Onaylanan rezervasyon</span>
      <span class="legend-item legend-rejected">Reddedilen rezervasyon</span>
      <span class="legend-item legend-pending">Beklemede rezervasyon</span>
    </div>
  </div>
`;



    tableContainer.innerHTML = html;
  } catch (err) {
    console.error(err);
    tableContainer.innerHTML = `<div class="empty error">Rezervasyonlar yüklenirken hata: ${err.message}</div>`;
  } finally {
    btnRefresh.disabled = false;
  }
}

function showLogin() {
  loginCard.style.display = "block";
  reservationsCard.style.display = "none";
}

function showReservations() {
  loginCard.style.display = "none";
  reservationsCard.style.display = "block";
  loadReservations();
}

btnLogin.addEventListener("click", async () => {
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value.trim();

  if (!email || !password) {
    setLoginStatus("Email ve şifre gerekli.", "error");
    return;
  }

  try {
    btnLogin.disabled = true;
    setLoginStatus("Giriş yapılıyor...", "info");

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Giriş başarısız.");
    }

    const data = await res.json();
    setToken(data.token);
    setLoginStatus("Giriş başarılı.", "success");
    showReservations();
  } catch (err) {
    console.error(err);
    setLoginStatus(err.message, "error");
  } finally {
    btnLogin.disabled = false;
  }
});

btnRefresh.addEventListener("click", loadReservations);

btnLogout.addEventListener("click", () => {
  setToken(null);
  showLogin();
});

/* Onayla / Reddet butonları için event delegation */
tableContainer.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");
  if (!id || (action !== "approve" && action !== "reject")) return;

  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  const isApproved = action === "approve";

  try {
    btn.disabled = true;

    const res = await fetch(`${API_BASE}/api/admin/reservations/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ isApproved }),
    });

    if (res.status === 401) {
      setToken(null);
      showLogin();
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Durum güncellenemedi.");
    }

    await loadReservations();
  } catch (err) {
    console.error(err);
    alert("Durum güncellenirken hata: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// Sayfa açılır açılmaz token varsa direkt listeye git
if (getToken()) {
  showReservations();
} else {
  showLogin();
}
