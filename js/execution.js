// execution.js — Gerencia o modo "Iniciar Rota" (Navegação Ponto a Ponto)

import { state, orderedStops, save } from "./state.js";
import { invalidateSize, redrawMap, focusMapOn } from "./map.js";
import { renderManifest, updateStatusbar } from "./ui.js";
import { showToast } from "./toast.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentStopIndex = 0;
let routeStops = [];
let executionActive = false;

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function initExecutionMode() {
  $("#btnStartRoute").addEventListener("click", startExecution);
  $("#btnExitExecution").addEventListener("click", exitExecution);

  $$("[data-exec-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const action = e.currentTarget.dataset.execAction;
      handleStopAction(action);
    });
  });
}

function startExecution() {
  routeStops = orderedStops().filter(s => s.geocoded);
  if (routeStops.length === 0) {
    showToast("Geocodifique as paradas antes de iniciar a rota.", "warning");
    return;
  }
  
  // Encontra a primeira parada não concluída
  currentStopIndex = routeStops.findIndex(s => !s.done);
  if (currentStopIndex === -1) {
    showToast("Todas as paradas já foram entregues!", "info");
    currentStopIndex = 0; // Volta pro começo pra revisão
  }

  executionActive = true;
  
  // Move o mapa para o slot de execução
  const mapEl = $("#map");
  $("#executionMapSlot").appendChild(mapEl);
  
  // Esconde o painel principal e mostra o modo execução
  $(".hero").style.display = "none";
  $(".content").style.display = "none";
  $("#executionMode").style.display = "flex";

  invalidateSize();
  redrawMap();
  updateExecutionUI();
}

function exitExecution() {
  executionActive = false;
  
  // Retorna o mapa para o painel principal
  const mapEl = $("#map");
  $(".map-card").insertBefore(mapEl, $("#mapThemeBtn"));
  
  // Mostra o painel principal e esconde execução
  $(".hero").style.display = "flex";
  $(".content").style.display = "flex";
  $("#executionMode").style.display = "none";

  invalidateSize();
  renderManifest();
  updateStatusbar();
  redrawMap();
}

function updateExecutionUI() {
  if (currentStopIndex >= routeStops.length) {
    // Fim da rota
    $("#execStopNum").textContent = "🎉";
    $("#execStopName").textContent = "Rota Concluída!";
    $("#execStopAddress").textContent = "Você passou por todas as paradas planejadas.";
    $("#executionProgress").style.width = "100%";
    $$("[data-exec-action]").forEach(b => b.disabled = true);
    $("#btnExecGmaps").style.display = "none";
    return;
  }

  const stop = routeStops[currentStopIndex];
  
  // Atualiza infos
  $("#execStopNum").textContent = currentStopIndex + 1;
  $("#execStopName").textContent = escapeHtml(stop.name || "Parada");
  $("#execStopAddress").textContent = escapeHtml(stop.address);
  
  // Atualiza progresso
  const pct = Math.round((currentStopIndex / routeStops.length) * 100);
  $("#executionProgress").style.width = pct + "%";

  // Focar o mapa no ponto atual
  focusMapOn(stop.lat, stop.lon, 17);

  // Atualiza link do Gmaps (apenas este ponto)
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lon}&travelmode=driving`;
  $("#btnExecGmaps").href = gmapsUrl;
  $("#btnExecGmaps").style.display = "block";

  $$("[data-exec-action]").forEach(b => b.disabled = false);
}

function handleStopAction(action) {
  if (currentStopIndex >= routeStops.length) return;
  const stop = routeStops[currentStopIndex];

  if (action === "delivered") {
    stop.status = "delivered";
    stop.done = true;
    showToast("Marcado como entregue!", "success");
  } else if (action === "failed") {
    stop.status = "failed";
    stop.error = "Não entregue";
    stop.done = false;
    showToast("Marcado como não entregue.", "error");
  } else if (action === "wait") {
    stop.status = "wait";
    stop.done = false;
    showToast("Pulando para a próxima parada.", "warning");
  }

  save();
  redrawMap(); // Atualiza cores dos pinos no mapa
  
  // Avança para o próximo
  currentStopIndex++;
  updateExecutionUI();
}

export function checkRouteReady() {
  const geocoded = orderedStops().filter((s) => s.geocoded);
  if (geocoded.length > 0 && state.routeGeoJSON) {
    $("#btnStartRoute").style.display = "block";
  } else {
    $("#btnStartRoute").style.display = "none";
  }
}
