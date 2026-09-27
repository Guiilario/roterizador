// app.js — ponto de entrada. Carrega o estado salvo, monta o mapa e
// liga a interface. É o único script referenciado pelo index.html.

import { load } from "./state.js";
import { initMap, redrawMap } from "./map.js";
import { bindEvents, renderManifest, updateStatusbar } from "./ui.js";
import { initExecutionMode } from "./execution.js";

function init() {
  load();
  initMap();
  bindEvents();
  initExecutionMode();
  renderManifest();
  updateStatusbar();
  redrawMap();
}

document.addEventListener("DOMContentLoaded", init);
