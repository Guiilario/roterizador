// state.js — estado central da aplicação + persistência em localStorage.
// Nenhum outro módulo guarda cópia própria dos dados: todos leem/escrevem
// através deste objeto `state`, então uma mudança feita em qualquer lugar
// aparece em todos os outros módulos automaticamente.

const LS_STATE_KEY = "rotafacil_state_v2";
const LS_GEOCACHE_KEY = "rotafacil_geocache";

export const state = {
  stops: [],           // {id, name, address, lat, lon, geocoded, error, done, order}
  depot: { name: "Partida", address: "", lat: null, lon: null, geocoded: false },
  roundtrip: false,
  routeGeoJSON: null,   // geometria da rota (GeoJSON) para desenhar no mapa
  lastStats: { km: null, min: null, viaOsrm: null },
  nextId: 1,
};

export function orderedStops() {
  return state.stops.slice().sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

export function save() {
  try {
    localStorage.setItem(
      LS_STATE_KEY,
      JSON.stringify({
        stops: state.stops,
        depot: state.depot,
        roundtrip: state.roundtrip,
      })
    );
  } catch (e) {
    /* armazenamento indisponível — segue sem persistir */
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.stops = data.stops || [];
    state.depot = data.depot || state.depot;
    state.roundtrip = !!data.roundtrip;
    state.nextId = 1 + state.stops.reduce((m, s) => Math.max(m, s.id || 0), 0);
  } catch (e) {
    /* nada salvo ainda */
  }
}

export function resetAll() {
  state.stops = [];
  state.depot = { name: "Partida", address: "", lat: null, lon: null, geocoded: false };
  state.roundtrip = false;
  state.routeGeoJSON = null;
  state.lastStats = { km: null, min: null, viaOsrm: null };
  save();
}

export function addStops(list) {
  let maxOrder = state.stops.reduce((m, s) => Math.max(m, s.order ?? 0), 0);
  list.forEach((item) => {
    if (!item || !item.address) return;
    maxOrder++;
    state.stops.push({
      id: state.nextId++,
      name: item.name || "Parada",
      address: item.address,
      lat: item.lat || null,
      lon: item.lon || null,
      geocoded: !!(item.lat && item.lon),
      error: null,
      done: false,
      order: maxOrder,
    });
  });
  save();
}

export function removeStop(id) {
  state.stops = state.stops.filter((s) => String(s.id) !== String(id));
  save();
}

/* ---------------- cache de geocodificação ---------------- */
export function geocodeCacheGet(addr) {
  try {
    const c = JSON.parse(localStorage.getItem(LS_GEOCACHE_KEY) || "{}");
    return c[addr.trim().toLowerCase()];
  } catch (e) {
    return null;
  }
}

export function geocodeCacheSet(addr, val) {
  try {
    const c = JSON.parse(localStorage.getItem(LS_GEOCACHE_KEY) || "{}");
    c[addr.trim().toLowerCase()] = val;
    localStorage.setItem(LS_GEOCACHE_KEY, JSON.stringify(c));
  } catch (e) {
    /* ignora falha de cache */
  }
}
