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

export function focusMapOn(lat, lon, zoom = 16) {
  if (map) map.flyTo([lat, lon], zoom, { animate: true, duration: 1.5 });
}

function pinIcon(label, { done = false, isDepot = false, status = null } = {}) {
  const cls = ["pin"];
  if (done) cls.push("done");
  if (isDepot) cls.push("depot");
  if (status === "delivered") cls.push("delivered");
  if (status === "wait") cls.push("wait");
  if (status === "failed") cls.push("failed");
  
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

  const seenCoords = {};
  const getJitteredCoord = (lat, lon) => {
    let key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (!seenCoords[key]) {
      seenCoords[key] = 0;
    }
    const count = seenCoords[key];
    seenCoords[key]++;
    
    if (count === 0) return [lat, lon];
    
    // Espalha em um círculo fixo para que nunca fiquem um em cima do outro.
    // 0.0002 é aproximadamente 20 metros, suficiente para separar os ícones
    const radius = 0.0002 + (Math.floor((count - 1) / 6) * 0.0001);
    const angle = count * (Math.PI / 3); // A cada 60 graus
    const offsetLat = Math.sin(angle) * radius;
    const offsetLon = Math.cos(angle) * radius;
    return [lat + offsetLat, lon + offsetLon];
  };

  if (state.depot.geocoded) {
    const [lat, lon] = getJitteredCoord(state.depot.lat, state.depot.lon);
    const m = L.marker([lat, lon], { icon: pinIcon("P", { isDepot: true }) });
    m.bindPopup(`<b>Partida</b><br>${escapeHtml(state.depot.address)}`);
    m.addTo(markersLayer);
    bounds.push([lat, lon]);
  }

  orderedStops().forEach((s, idx) => {
    if (!s.geocoded) return;
    const [lat, lon] = getJitteredCoord(s.lat, s.lon);
    const m = L.marker([lat, lon], { icon: pinIcon(String(idx + 1), { done: s.done, status: s.status }) });
    m.bindPopup(`<b>${idx + 1}. ${escapeHtml(s.name)}</b><br>${escapeHtml(s.address)}`);
    m.addTo(markersLayer);
    bounds.push([lat, lon]);
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
