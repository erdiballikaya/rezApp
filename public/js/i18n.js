// js/i18n.js

let currentLang = "tr";
let translations = {}; // aktif dil sözlüğü

function setLanguageDirection(lang) {
  const html = document.documentElement;

  if (lang === "ar") {
    html.setAttribute("dir", "rtl");
    html.setAttribute("lang", "ar");
  } else if (lang === "en") {
    html.setAttribute("dir", "ltr");
    html.setAttribute("lang", "en");
  } else {
    // varsayılan Türkçe
    html.setAttribute("dir", "ltr");
    html.setAttribute("lang", "tr");
  }
}

// Aktif dili yükle
async function loadLanguage(lang) {
  try {
    const response = await fetch(`/i18n/${lang}.json?_=${Date.now()}`);
    if (!response.ok) {
      throw new Error("Translation file not found");
    }
    translations = await response.json();
    currentLang = lang;

    setLanguageDirection(lang);
    applyTranslations();
    saveLanguage(lang);
    highlightActiveLang(lang);
  } catch (err) {
    console.error("Error loading language:", err);
  }
}

// LocalStorage'a yaz
function saveLanguage(lang) {
  try {
    localStorage.setItem("rezapp-lang", lang);
  } catch (e) {
    // storage kapalıysa sessiz geç
  }
}

// LocalStorage'dan oku
function getSavedLanguage() {
  try {
    return localStorage.getItem("rezapp-lang");
  } catch (e) {
    return null;
  }
}

// Basit t() fonksiyonu
function t(key) {
  return translations[key] || key;
}

// Sayfadaki tüm data-i18n alanlarını güncelle
function applyTranslations() {
  // İçerik metni
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });

  // placeholder gibi attribute’ler
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });
}

// Dil butonlarına click event bağla
function setupLanguageButtons() {
  document.querySelectorAll("[data-set-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-set-lang");
      if (!lang) return;
      loadLanguage(lang);
    });
  });
}

function highlightActiveLang(lang) {
  document.querySelectorAll("[data-set-lang]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-set-lang") === lang);
  });
}


// Sayfa yüklenince çalıştır
document.addEventListener("DOMContentLoaded", () => {
  setupLanguageButtons();

  // Daha önce kaydedilen dil varsa onu kullan
  const savedLang = getSavedLanguage();
  const initialLang = savedLang || "tr";

  loadLanguage(initialLang);
});
