// ui.js — Liga o HTML a tudo. Layout simplificado: hero acima do fold
// no celular (input + mic + add + mapa + otimizar), lista de paradas
// e opções secundárias rolando abaixo.

import { state, save, orderedStops, addStops, removeStop, resetAll } from "./state.js";
import { geocodePending, regeocodeStop } from "./geocode.js";
import { optimize, recomputeForFixedOrder } from "./routing.js";
import { redrawMap, invalidateSize, toggleMapTheme, isMapDark } from "./map.js";
import { speechSupported, createRecognizer } from "./voice.js";
import { AutocompleteController } from "./autocomplete.js";
import { showToast } from "./toast.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* =========================================================================
   AUTOCOMPLETE
   ========================================================================= */

let addrAC = null;
let depotAC = null;
let selectedData = null; // dados do endereço verificado

function setupAutocomplete() {
  // Autocomplete principal (hero)
  addrAC = new AutocompleteController(
    $("#addrInput"),
    $("#addrAutocomplete"),
    {
      onSelect: (result) => {
        selectedData = result;
        $("#btnAdd").disabled = false;
        $("#inputHint").textContent = "✅ Endereço verificado!";
        $("#inputHint").className = "input-hint ok";
      },
      onClear: () => {
        selectedData = null;
        $("#btnAdd").disabled = true;
        $("#inputHint").textContent = "Digite o endereço e selecione da lista";
        $("#inputHint").className = "input-hint";
      },
    }
  );

  // Autocomplete do depósito
  depotAC = new AutocompleteController(
    $("#depotInput"),
    $("#depotAutocomplete"),
    {
      onSelect: (result) => {
        state.depot.address = result.address;
        state.depot.lat = result.lat;
        state.depot.lon = result.lon;
        state.depot.geocoded = true;
        save();
        renderStops();
        updateStats();
        redrawMap();
        showToast("Ponto de partida definido!", "success");
      },
      onClear: () => {
        state.depot.geocoded = false;
        state.depot.lat = null;
        state.depot.lon = null;
      },
    }
  );
}

/* =========================================================================
   VOZ
   ========================================================================= */

let recognizer = null;
let listening = false;
let baseText = "";

function setupVoice() {
  const micBtn = $("#micBtn");
  const addrInput = $("#addrInput");
  const hint = $("#inputHint");

  if (!speechSupported()) {
    micBtn.disabled = true;
    micBtn.title = "Voz não suportada neste navegador";
    return;
  }

  recognizer = createRecognizer({
    onStart: () => {
      listening = true;
      micBtn.classList.add("recording");
      micBtn.textContent = "⏹";
      hint.textContent = "🔴 Ouvindo... fale o endereço";
      hint.className = "input-hint recording";
    },
    onInterim: (text) => {
      addrInput.value = baseText + text;
    },
    onFinal: (text) => {
      baseText = (baseText + text).trim() + " ";
      addrInput.value = baseText.trim();
      // Dispara busca no autocomplete
      addrInput.dispatchEvent(new Event("input"));
    },
    onEnd: () => {
      listening = false;
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎤";
      if (addrInput.value.trim()) {
        hint.textContent = "Selecione o endereço correto da lista";
        hint.className = "input-hint";
      } else {
        hint.textContent = "Digite o endereço e selecione da lista";
        hint.className = "input-hint";
      }
    },
    onError: (e) => {
      listening = false;
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎤";
      hint.textContent = e.error === "not-allowed"
        ? "Microfone bloqueado pelo navegador"
        : "Não entendi — tente novamente";
      hint.className = "input-hint";
    },
  });

  micBtn.addEventListener("click", () => {
    if (listening) { recognizer.stop(); return; }
    baseText = addrInput.value ? addrInput.value.trim() + " " : "";
    try { recognizer.start(); } catch (e) { /* já rodando */ }
  });
}

/* =========================================================================
   ADICIONAR PARADA
   ========================================================================= */

function handleAdd() {
  if (!selectedData) {
    showToast("Selecione um endereço da lista primeiro", "warning");
    return;
  }
  addStops([{
    name: "Parada",
    address: selectedData.address,
    lat: selectedData.lat,
    lon: selectedData.lon,
  }]);

  // Reset
  addrAC.reset();
  selectedData = null;
  $("#btnAdd").disabled = true;
  $("#inputHint").textContent = "Parada adicionada! Digite a próxima";
  $("#inputHint").className = "input-hint ok";
  setTimeout(() => {
    if (!selectedData) {
      $("#inputHint").textContent = "Digite o endereço e selecione da lista";
      $("#inputHint").className = "input-hint";
    }
  }, 2000);

  renderStops();
  updateStats();
  redrawMap();
  showToast("Parada adicionada à rota!", "success");
  $("#addrInput").focus();
}

/* =========================================================================
   IMPORTAÇÃO (bulk / CSV)
   ========================================================================= */

function parseBulkLine(line) {
  line = line.trim();
  if (!line) return null;
  const parts = line.split(";");
  if (parts.length >= 2) return { name: parts[0].trim(), address: parts.slice(1).join(";").trim() };
  return { name: "Parada", address: line };
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field.length || row.length) { row.push(field); rows.push(row); }
        field = ""; row = [];
        if (c === "\r" && text[i+1] === "\n") i++;
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return;
  let start = 0, nameIdx = 0, addrIdx = 1;
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const looksLikeHeader = header.some((h) => ["nome","name","endereco","endereço","address"].includes(h));
  if (looksLikeHeader) {
    start = 1;
    const ni = header.findIndex((h) => ["nome","name"].includes(h));
    const ai = header.findIndex((h) => ["endereco","endereço","address"].includes(h));
    if (ni >= 0) nameIdx = ni;
    if (ai >= 0) addrIdx = ai; else addrIdx = header.length - 1;
  } else if (rows[0].length === 1) { addrIdx = 0; nameIdx = -1; }
  const list = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const address = (r[addrIdx] || "").trim();
    const name = nameIdx >= 0 ? (r[nameIdx] || "").trim() : "";
    if (address) list.push({ name: name || "Parada", address });
  }
  addStops(list);
  renderStops(); updateStats();
  showToast(`${list.length} parada(s) adicionada(s)`, "success");
}

/* =========================================================================
   GEOCODIFICAÇÃO
   ========================================================================= */

async function runGeocoding() {
  const email = $("#nominatimEmail").value.trim();
  const brOnly = $("#brOnlyCheck").checked;
  const btn = $("#btnGeocode");
  const total = state.stops.filter((s) => !s.geocoded).length +
                (state.depot.address && !state.depot.geocoded ? 1 : 0);
  if (total === 0) { showToast("Tudo já geocodificado!", "info"); return; }

  btn.disabled = true;
  $("#geoProgressWrap").style.display = "block";
  $("#geoLog").innerHTML = "";

  const result = await geocodePending({
    email, brOnly,
    onProgress: ({ done, total, label, ok, message }) => {
      $("#geoProgressFill").style.width = Math.round((done/total)*100) + "%";
      $("#geoProgressText").textContent = `${done} de ${total}...`;
      const div = document.createElement("div");
      div.className = ok ? "ok" : "fail";
      div.textContent = (ok ? "✓ " : "✗ ") + label + (message ? " — " + message : "");
      $("#geoLog").prepend(div);
      renderStops(); updateStats();
    },
  });

  btn.disabled = false;
  $("#geoProgressText").textContent = `${result.ok}/${result.total} com sucesso`;
  redrawMap(); save();
  showToast(`Geocodificação: ${result.ok}/${result.total}`, result.ok === result.total ? "success" : "warning");
}

/* =========================================================================
   OTIMIZAÇÃO
   ========================================================================= */

async function runOptimize() {
  const geocoded = state.stops.filter((s) => s.geocoded);
  if (geocoded.length < 2) {
    showToast("Geocodifique ao menos 2 paradas", "warning");
    return;
  }
  const btn = $("#btnOptimize");
  const status = $("#optStatus");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span> Calculando melhor rota...';

  const points = [];
  if (state.depot.geocoded) points.push({ lat: state.depot.lat, lon: state.depot.lon, ref: "depot" });
  geocoded.forEach((s) => points.push({ lat: s.lat, lon: s.lon, ref: s.id }));

  try {
    const result = await optimize(points, state.roundtrip);
    result.order.forEach((pIdx, pos) => {
      const p = points[pIdx];
      if (p.ref === "depot") state.depot.order = pos;
      else { const s = state.stops.find((x) => x.id === p.ref); if (s) s.order = pos; }
    });
    state.routeGeoJSON = result.geometry;
    state.lastStats = { km: result.totalKm, min: result.totalMin, viaOsrm: result.usedOsrm };
    status.textContent = result.usedOsrm
      ? "✅ Rota otimizada com distâncias reais"
      : "⚠️ Usada distância em linha reta (OSRM indisponível)";
    showToast("Rota otimizada!", "success");
  } catch (e) {
    status.textContent = "❌ " + e.message;
    showToast("Erro: " + e.message, "error");
  }

  btn.disabled = false;
  save(); renderStops(); updateStats(); redrawMap();
}

async function recomputeAfterReorder() {
  const pts = [];
  if (state.depot.geocoded) pts.push({ lat: state.depot.lat, lon: state.depot.lon });
  orderedStops().filter((s) => s.geocoded).forEach((s) => pts.push({ lat: s.lat, lon: s.lon }));
  const r = await recomputeForFixedOrder(pts);
  state.routeGeoJSON = r.geometry;
  state.lastStats = { km: r.totalKm, min: r.totalMin, viaOsrm: !!r.geometry };
  updateStats(); redrawMap();
}

/* =========================================================================
   LISTA DE PARADAS (manifesto)
   ========================================================================= */

let dragSrcId = null;

export function renderStops() {
  const wrap = $("#stopsList");
  const ord = orderedStops();

  if (!ord.length && !state.depot.address) {
    wrap.innerHTML = `<div class="empty-state"><span class="empty-icon">📦</span><p>Nenhuma parada adicionada.</p></div>`;
    return;
  }
  wrap.innerHTML = "";

  // Depósito
  if (state.depot.address) {
    const el = document.createElement("div");
    el.className = "stop-row";
    el.innerHTML = `
      <div class="stop-badge depot">P</div>
      <div class="stop-body">
        <div class="stop-addr">${escapeHtml(state.depot.address)}</div>
        <div class="stop-meta">
          <span class="tag ${state.depot.geocoded ? "ok" : "err"}">${state.depot.geocoded ? "✓ localizado" : "pendente"}</span>
        </div>
      </div>`;
    wrap.appendChild(el);
  }

  // Paradas
  ord.forEach((s, idx) => {
    const el = document.createElement("div");
    el.className = "stop-row" + (s.done ? " done" : "");
    el.draggable = true;
    el.dataset.id = s.id;

    const badgeCls = s.error ? "stop-badge err" : "stop-badge";
    const gmapsUrl = s.geocoded
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}&travelmode=driving`;

    const nameHtml = s.name && s.name !== "Parada"
      ? `<div class="stop-name">${escapeHtml(s.name)}</div>` : "";

    el.innerHTML = `
      <div class="handle">⠿</div>
      <div class="${badgeCls}">${idx + 1}</div>
      <div class="stop-body">
        ${nameHtml}
        <div class="stop-addr" data-role="view">${escapeHtml(s.address)}</div>
        <div class="stop-edit" data-role="edit">
          <input type="text" value="${escapeHtml(s.address)}" data-role="edit-input">
          <button data-action="save">Salvar</button>
        </div>
        <div class="stop-meta">
          <span class="tag ${s.geocoded ? "ok" : "err"}">${s.geocoded ? "✓ localizado" : s.error || "pendente"}</span>
          <label class="done-check"><input type="checkbox" data-action="done" ${s.done ? "checked" : ""}> entregue</label>
        </div>
      </div>
      <div class="stop-actions">
        <button data-action="edit" title="Editar">✏️</button>
        <a href="${gmapsUrl}" target="_blank" rel="noopener"><button title="Google Maps">🗺️</button></a>
        <button data-action="remove" class="del" title="Remover">✕</button>
      </div>`;
    wrap.appendChild(el);
  });

  bindStopEvents(wrap);
}

function bindStopEvents(wrap) {
  wrap.querySelectorAll('[data-action="done"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const row = e.target.closest(".stop-row");
      const s = state.stops.find((x) => x.id == row.dataset.id);
      s.done = e.target.checked;
      row.classList.toggle("done", s.done);
      save(); updateStats(); redrawMap();
    });
  });

  wrap.querySelectorAll('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const row = e.target.closest(".stop-row");
      removeStop(row.dataset.id);
      renderStops(); updateStats(); redrawMap();
      showToast("Parada removida", "info");
    });
  });

  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const row = e.target.closest(".stop-row");
      row.querySelector('[data-role="view"]').style.display = "none";
      row.querySelector('[data-role="edit"]').classList.add("show");
      row.querySelector('[data-role="edit-input"]').focus();
    });
  });

  wrap.querySelectorAll('[data-action="save"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const row = e.target.closest(".stop-row");
      const s = state.stops.find((x) => x.id == row.dataset.id);
      const val = row.querySelector('[data-role="edit-input"]').value.trim();
      if (val && val !== s.address) {
        const email = $("#nominatimEmail").value.trim();
        const brOnly = $("#brOnlyCheck").checked;
        await regeocodeStop(s, val, { email, brOnly });
        renderStops(); updateStats(); redrawMap();
        showToast(s.geocoded ? "Endereço atualizado!" : "Endereço não encontrado no mapa", s.geocoded ? "success" : "warning");
      } else {
        row.querySelector('[data-role="view"]').style.display = "";
        row.querySelector('[data-role="edit"]').classList.remove("show");
      }
    });
  });

  // Drag-and-drop
  wrap.querySelectorAll('.stop-row[draggable="true"]').forEach((row) => {
    row.addEventListener("dragstart", () => { dragSrcId = row.dataset.id; row.classList.add("dragging"); });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetId = row.dataset.id;
      if (!dragSrcId || targetId === dragSrcId) return;
      const ordNow = orderedStops();
      const srcIdx = ordNow.findIndex((s) => String(s.id) === String(dragSrcId));
      const tgtIdx = ordNow.findIndex((s) => String(s.id) === String(targetId));
      if (srcIdx < 0 || tgtIdx < 0) return;
      const [moved] = ordNow.splice(srcIdx, 1);
      ordNow.splice(tgtIdx, 0, moved);
      ordNow.forEach((s, i) => (s.order = i));
      save(); renderStops(); updateStats();
      recomputeAfterReorder();
    });
  });
}

/* =========================================================================
   STATS
   ========================================================================= */

function formatMin(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

export function updateStats() {
  const total = state.stops.length;
  const pending = state.stops.filter((s) => !s.geocoded).length;
  const hasDist = state.lastStats.km != null;
  const hasTime = state.lastStats.min != null;

  $("#statTotal").textContent = total;

  // Distância e tempo — mostra quando disponível
  const distEl = $("#statDistWrap");
  const timeEl = $("#statTimeWrap");
  const distSep = $("#statDistSep");
  const timeSep = $("#statTimeSep");

  if (hasDist) {
    $("#statDist").textContent = state.lastStats.km.toFixed(1) + " km";
    distEl.style.display = ""; distSep.style.display = "";
  } else {
    distEl.style.display = "none"; distSep.style.display = "none";
  }
  if (hasTime) {
    $("#statTime").textContent = formatMin(state.lastStats.min);
    timeEl.style.display = ""; timeSep.style.display = "";
  } else {
    timeEl.style.display = "none"; timeSep.style.display = "none";
  }

  // Badges
  $("#stopsCountBadge").textContent = total;
  $("#statPending").textContent = pending;
}

/* =========================================================================
   EXPORTAÇÃO
   ========================================================================= */

function exportCsv() {
  const rows = [["Ordem","Nome","Endereço","Latitude","Longitude","Entregue"]];
  if (state.depot.address) rows.push(["Partida", state.depot.name, state.depot.address, state.depot.lat||"", state.depot.lon||"", ""]);
  orderedStops().forEach((s, i) => {
    rows.push([i+1, s.name, s.address, s.lat||"", s.lon||"", s.done?"sim":"não"]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rota-otimizada.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("CSV exportado!", "success");
}

function openGoogleMaps() {
  const ord = orderedStops().filter((s) => s.geocoded);
  if (!ord.length) { showToast("Geocodifique paradas primeiro", "warning"); return; }
  const pts = [];
  if (state.depot.geocoded) pts.push(`${state.depot.lat},${state.depot.lon}`);
  ord.forEach((s) => pts.push(`${s.lat},${s.lon}`));
  if (state.roundtrip && state.depot.geocoded) pts.push(`${state.depot.lat},${state.depot.lon}`);

  const chunk = 9;
  const links = [];
  for (let i = 0; i < pts.length - 1; i += chunk) {
    const seg = pts.slice(i, i + chunk + 1);
    if (seg.length < 2) continue;
    const params = new URLSearchParams({ api:"1", origin:seg[0], destination:seg[seg.length-1], travelmode:"driving" });
    if (seg.length > 2) params.set("waypoints", seg.slice(1,-1).join("|"));
    links.push(`https://www.google.com/maps/dir/?${params}`);
  }
  links.forEach((l) => window.open(l, "_blank"));
  if (links.length > 1) showToast(`Rota em ${links.length} abas`, "info");
}

/* =========================================================================
   BIND TUDO
   ========================================================================= */

export function bindEvents() {
  setupAutocomplete();
  setupVoice();

  // Form de endereço
  $("#addrForm").addEventListener("submit", (e) => { e.preventDefault(); handleAdd(); });

  // Depósito
  $("#roundtripCheck").addEventListener("change", (e) => { state.roundtrip = e.target.checked; save(); });

  // Importação
  $("#btnAddBulk").addEventListener("click", () => {
    const list = $("#bulkInput").value.split("\n").map(parseBulkLine).filter(Boolean);
    if (!list.length) { showToast("Nenhuma parada no texto", "warning"); return; }
    addStops(list);
    renderStops(); updateStats();
    $("#bulkInput").value = "";
    showToast(`${list.length} parada(s) adicionada(s)`, "success");
  });

  $("#btnUploadCsv").addEventListener("click", () => $("#csvFile").click());
  $("#csvFile").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(reader.result);
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  });

  // Geocode & Optimize
  $("#btnGeocode").addEventListener("click", runGeocoding);
  $("#btnOptimize").addEventListener("click", runOptimize);

  // Export
  $("#btnExportCsv").addEventListener("click", exportCsv);
  $("#btnPrint").addEventListener("click", () => window.print());
  $("#btnGmapsFull").addEventListener("click", openGoogleMaps);

  // Map theme toggle
  const themeBtn = $("#mapThemeBtn");
  themeBtn.textContent = isMapDark() ? "☀️" : "🌙";
  themeBtn.addEventListener("click", () => {
    const dark = toggleMapTheme();
    themeBtn.textContent = dark ? "☀️" : "🌙";
  });

  // Reset
  $("#btnReset").addEventListener("click", () => {
    if (!confirm("Apagar todas as paradas e a rota?")) return;
    resetAll();
    if (addrAC) addrAC.reset();
    if (depotAC) depotAC.reset();
    $("#depotInput").value = "";
    $("#bulkInput").value = "";
    $("#roundtripCheck").checked = false;
    selectedData = null;
    $("#btnAdd").disabled = true;
    renderStops(); updateStats(); redrawMap();
    showToast("Tudo limpo!", "info");
  });

  // Restaura dados salvos
  $("#depotInput").value = state.depot.address || "";
  if (state.depot.address && depotAC) depotAC.setVerified(state.depot.address);
  $("#roundtripCheck").checked = !!state.roundtrip;
}

// Aliases para compatibilidade com app.js
export { renderStops as renderManifest, updateStats as updateStatusbar };
