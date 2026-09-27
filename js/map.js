// map.js — mapa Leaflet com suporte a tema claro/escuro.

import { state, orderedStops } from "./state.js";

let map = null;
let markersLayer = null;
let routeLine = null;
let tileLayer = null;
let isDarkMap = true;

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

export function initMap() {
  // Carrega preferência salva
  const saved = localStorage.getItem("rotafacil_map_dark");
  isDarkMap = saved === null ? true : saved === "1";

  map = L.map("map", { zoomControl: true }).setView([-23.9608, -46.3339], 12);

  tileLayer = L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTR,
    className: isDarkMap ? "dark-tiles" : "",
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  return map;
}

export function toggleMapTheme() {
  isDarkMap = !isDarkMap;
  localStorage.setItem("rotafacil_map_dark", isDarkMap ? "1" : "0");

  map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTR,
    className: isDarkMap ? "dark-tiles" : "",
  }).addTo(map);

  // Traz marcadores e rota de volta para frente
  if (routeLine) routeLine.bringToFront();
  markersLayer.eachLayer((l) => { if (l.bringToFront) l.bringToFront(); });

  return isDarkMap;
}

export function isMapDark() {
  return isDarkMap;
}

export function invalidateSize() {
  if (map) setTimeout(() => map.invalidateSize(), 200);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function pinIcon(label, { done = false, isDepot = false } = {}) {
  const cls = ["pin"];
  if (done) cls.push("done");
  if (isDepot) cls.push("depot");
  return L.divIcon({
    html: `<div class="${cls.join(" ")}"><span>${label}</span></div>`,
    className: "leaflet-div-icon",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

export function redrawMap() {
  if (!map) return;
  markersLayer.clearLayers();
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  const bounds = [];

  if (state.depot.geocoded) {
    const m = L.marker([state.depot.lat, state.depot.lon], { icon: pinIcon("P", { isDepot: true }) });
    m.bindPopup(`<b>Partida</b><br>${escapeHtml(state.depot.address)}`);
    m.addTo(markersLayer);
    bounds.push([state.depot.lat, state.depot.lon]);
  }

  orderedStops().forEach((s, idx) => {
    if (!s.geocoded) return;
    const m = L.marker([s.lat, s.lon], { icon: pinIcon(String(idx + 1), { done: s.done }) });
    m.bindPopup(`<b>${idx + 1}. ${escapeHtml(s.name)}</b><br>${escapeHtml(s.address)}`);
    m.addTo(markersLayer);
    bounds.push([s.lat, s.lon]);
  });

  if (state.routeGeoJSON) {
    routeLine = L.geoJSON(state.routeGeoJSON, {
      style: { color: "#5882f0", weight: 4, opacity: 0.85 },
    }).addTo(map);
  } else if (bounds.length > 1) {
    const pts = [];
    if (state.depot.geocoded) pts.push([state.depot.lat, state.depot.lon]);
    orderedStops().forEach((s) => s.geocoded && pts.push([s.lat, s.lon]));
    routeLine = L.polyline(pts, { color: "#5882f0", weight: 3, opacity: 0.5, dashArray: "6 6" }).addTo(map);
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }
}
