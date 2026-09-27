// geocode.js — transforma endereço em texto -> latitude/longitude,
// usando o serviço gratuito Nominatim (OpenStreetMap). Respeita o limite
// de uso justo do serviço público (~1 requisição por segundo) e usa um
// cache local para nunca geocodificar o mesmo endereço duas vezes.

import { state, save, geocodeCacheGet, geocodeCacheSet } from "./state.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeAddress(address, { email, brOnly }) {
  const cached = geocodeCacheGet(address);
  if (cached) return cached;

  const params = new URLSearchParams({ format: "json", q: address, limit: "1" });
  if (brOnly) params.set("countrycodes", "br");
  if (email) params.set("email", email);

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Falha na requisição");
  const data = await res.json();
  if (!data.length) throw new Error("Endereço não encontrado");

  const val = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  geocodeCacheSet(address, val);
  return val;
}

/**
 * Geocodifica todas as paradas pendentes (e o depósito, se houver),
 * uma por vez, respeitando o limite de 1 req/s do Nominatim.
 * @param {Object} opts
 * @param {string} opts.email
 * @param {boolean} opts.brOnly
 * @param {(info:{done:number,total:number,label:string,ok:boolean,message?:string})=>void} opts.onProgress
 */
export async function geocodePending({ email, brOnly, onProgress }) {
  const targets = state.stops.filter((s) => !s.geocoded);
  const depotNeeded = state.depot.address && !state.depot.geocoded;
  const total = targets.length + (depotNeeded ? 1 : 0);
  if (total === 0) return { total: 0, ok: 0 };

  let done = 0;
  let ok = 0;

  if (depotNeeded) {
    try {
      const r = await geocodeAddress(state.depot.address, { email, brOnly });
      state.depot.lat = r.lat;
      state.depot.lon = r.lon;
      state.depot.geocoded = true;
      ok++;
      onProgress && onProgress({ done: ++done, total, label: "Ponto de partida", ok: true });
    } catch (e) {
      onProgress && onProgress({ done: ++done, total, label: "Ponto de partida", ok: false, message: e.message });
    }
    save();
    await sleep(1100);
  }

  for (const s of targets) {
    try {
      const r = await geocodeAddress(s.address, { email, brOnly });
      s.lat = r.lat;
      s.lon = r.lon;
      s.geocoded = true;
      s.error = null;
      ok++;
      onProgress && onProgress({ done: ++done, total, label: s.name, ok: true });
    } catch (e) {
      s.error = e.message;
      onProgress && onProgress({ done: ++done, total, label: s.name, ok: false, message: e.message });
    }
    save();
    await sleep(1100);
  }

  return { total, ok };
}

/** Geocodifica (ou re-geocodifica) uma única parada, usada ao editar um endereço na lista. */
export async function regeocodeStop(stop, newAddress, { email, brOnly }) {
  stop.address = newAddress;
  try {
    const r = await geocodeAddress(newAddress, { email, brOnly });
    stop.lat = r.lat;
    stop.lon = r.lon;
    stop.geocoded = true;
    stop.error = null;
  } catch (e) {
    stop.geocoded = false;
    stop.error = e.message;
  }
  save();
}

/** Geocodifica o texto ditado/digitado no campo de voz antes de adicionar, se o usuário quiser conferir no mapa. */
export { geocodeAddress };
