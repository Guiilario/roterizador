// autocomplete.js — Busca e valida endereços em tempo real usando Nominatim,
// restringindo os resultados às cidades da Baixada Santista.
// Preserva o número digitado pelo usuário quando o Nominatim não o retorna.

import { geocodeCacheSet } from "./state.js";

// ── Configuração da região ──────────────────────────────────────────────
const BBOX = {
  south: -24.35, west: -46.80,
  north: -23.80, east: -46.15,
};

const ALLOWED_CITIES = [
  "santos", "são vicente", "sao vicente", "guarujá", "guaruja",
  "praia grande", "cubatão", "cubatao", "bertioga",
  "mongaguá", "mongagua", "itanhaém", "itanhaem", "peruíbe", "peruibe",
];

function normalize(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isWithinBounds(lat, lon) {
  return lat >= BBOX.south && lat <= BBOX.north && lon >= BBOX.west && lon <= BBOX.east;
}

function isAllowedCity(displayName) {
  const norm = normalize(displayName);
  return ALLOWED_CITIES.some((city) => norm.includes(normalize(city)));
}

// ── Extrai número da casa do que o usuário digitou ──────────────────────
// Brasileiro tipicamente escreve: "Rua X, 123, Cidade" ou "Rua X 123"
function extractHouseNumber(query) {
  if (!query) return null;
  // Tenta pegar o número que vem após a primeira vírgula
  const commaIdx = query.indexOf(",");
  if (commaIdx >= 0) {
    const afterComma = query.substring(commaIdx + 1);
    const match = afterComma.match(/^\s*(\d{1,5}[A-Za-z]?)\b/);
    if (match) return match[1];
  }
  // Fallback: número no final antes de vírgula/traço/fim
  const fallback = query.match(/\b(\d{1,5}[A-Za-z]?)\s*(?:[,\-]|$)/);
  return fallback ? fallback[1] : null;
}

// ── Debounce ────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── Busca no Nominatim ──────────────────────────────────────────────────
async function searchNominatim(query) {
  if (query.trim().length < 3) return [];

  const params = new URLSearchParams({
    format: "json", q: query, limit: "8",
    countrycodes: "br", addressdetails: "1",
    viewbox: `${BBOX.west},${BBOX.north},${BBOX.east},${BBOX.south}`,
    bounded: "1",
  });

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return data.filter((item) => {
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      if (!isWithinBounds(lat, lon)) return false;
      const addr = item.address || {};
      const cityField = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || "";
      return isAllowedCity(cityField) || isAllowedCity(item.display_name);
    });
  } catch (e) {
    console.warn("Autocomplete search failed:", e);
    return [];
  }
}

// ── Formatar resultado ──────────────────────────────────────────────────
function formatResult(item, userNumber = null) {
  const addr = item.address || {};
  const road = addr.road || "";
  const number = addr.house_number || userNumber || "";
  const neighbourhood = addr.suburb || addr.neighbourhood || "";
  const city = addr.city || addr.town || addr.municipality || "";
  const state = addr.state || "";

  // Texto principal (exibido na dropdown)
  let main = road;
  if (number) main += `, ${number}`;
  if (!main) main = item.display_name.split(",")[0];

  const subParts = [neighbourhood, city, state].filter(Boolean);
  const sub = subParts.join(", ");

  // Endereço limpo para salvar (inclui o número)
  const parts = [road, number, neighbourhood, city, state].filter(Boolean);
  const cleanAddress = parts.join(", ");

  return { main, sub, cleanAddress };
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ── Classe AutocompleteController ───────────────────────────────────────
export class AutocompleteController {
  constructor(input, resultsContainer, { onSelect, onClear } = {}) {
    this.input = input;
    this.container = resultsContainer;
    this.onSelect = onSelect || (() => {});
    this.onClear = onClear || (() => {});
    this.results = [];
    this.selectedIdx = -1;
    this.verified = false;
    this.lastVerifiedAddress = "";

    this._search = debounce(this._doSearch.bind(this), 450);
    this._bind();
  }

  _bind() {
    this.input.addEventListener("input", () => {
      if (this.verified && this.input.value !== this.lastVerifiedAddress) {
        this.verified = false;
        this.input.classList.remove("verified");
        this.onClear();
      }
      this._search(this.input.value);
    });

    this.input.addEventListener("focus", () => {
      if (this.results.length > 0 && !this.verified) {
        this.container.classList.add("visible");
      }
    });

    this.input.addEventListener("keydown", (e) => {
      if (!this.container.classList.contains("visible")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.selectedIdx = Math.min(this.selectedIdx + 1, this.results.length - 1);
        this._highlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.selectedIdx = Math.max(this.selectedIdx - 1, 0);
        this._highlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (this.selectedIdx >= 0) this._select(this.selectedIdx);
      } else if (e.key === "Escape") {
        this._close();
      }
    });

    document.addEventListener("click", (e) => {
      if (!this.input.contains(e.target) && !this.container.contains(e.target)) {
        this._close();
      }
    });
  }

  async _doSearch(query) {
    if (query.trim().length < 3) { this._close(); return; }

    this.container.innerHTML = '<div class="autocomplete-loading"><span class="spinner"></span> Buscando...</div>';
    this.container.classList.add("visible");

    const results = await searchNominatim(query);
    this.results = results;
    this.selectedIdx = -1;

    if (!results.length) {
      this.container.innerHTML = '<div class="autocomplete-empty">Nenhum endereço encontrado na Baixada Santista</div>';
      return;
    }

    // Extrai o número que o usuário digitou para preservar
    const userNumber = extractHouseNumber(query);

    this.container.innerHTML = "";
    results.forEach((item, idx) => {
      const { main, sub } = formatResult(item, userNumber);
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      div.innerHTML = `
        <span class="ac-icon">📍</span>
        <div class="ac-text">
          <div class="ac-main">${escapeHtml(main)}</div>
          <div class="ac-sub">${escapeHtml(sub)}</div>
        </div>`;
      div.addEventListener("click", () => this._select(idx));
      div.addEventListener("mouseenter", () => { this.selectedIdx = idx; this._highlight(); });
      this.container.appendChild(div);
    });
  }

  _select(idx) {
    const item = this.results[idx];
    if (!item) return;

    // Preserva o número digitado pelo usuário
    const userNumber = extractHouseNumber(this.input.value);
    const { cleanAddress } = formatResult(item, userNumber);

    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    this.input.value = cleanAddress;
    this.lastVerifiedAddress = cleanAddress;
    this.verified = true;
    this.input.classList.add("verified");
    this._close();

    geocodeCacheSet(cleanAddress, { lat, lon });
    this.onSelect({ lat, lon, address: cleanAddress, displayName: item.display_name });
  }

  _highlight() {
    const items = this.container.querySelectorAll(".autocomplete-item");
    items.forEach((el, i) => el.classList.toggle("selected", i === this.selectedIdx));
    if (items[this.selectedIdx]) items[this.selectedIdx].scrollIntoView({ block: "nearest" });
  }

  _close() {
    this.container.classList.remove("visible");
    this.selectedIdx = -1;
  }

  isVerified() { return this.verified; }

  reset() {
    this.input.value = "";
    this.verified = false;
    this.lastVerifiedAddress = "";
    this.results = [];
    this.input.classList.remove("verified");
    this._close();
  }

  setVerified(address) {
    this.input.value = address;
    this.lastVerifiedAddress = address;
    this.verified = true;
    this.input.classList.add("verified");
  }
}
