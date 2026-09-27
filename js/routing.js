// routing.js — motor de otimização de rota.
//
// Segue a mesma ideia do protótipo em Python que veio junto com o projeto
// (roteirizador_entregas.py), só que 100% em JavaScript para funcionar
// direto no navegador, sem backend nenhum — assim dá pra hospedar de graça
// no GitHub Pages e testar no celular:
//
//   Python (backend)                      JavaScript (este arquivo)
//   ────────────────────                  ──────────────────────────
//   OSRM /table  -> matriz de distância    fetchDistanceMatrix() -> OSRM /table
//   OR-Tools     -> resolve o TSP          solveTsp() -> nearest-neighbor + 2-opt
//   (precisa de servidor Python)           (roda inteiro no navegador do usuário)
//
// Se o servidor público do OSRM estiver fora do ar ou não conseguir montar
// a matriz, cai automaticamente para distância em linha reta (haversine),
// então a rota sempre é gerada, só que com precisão menor.

const OSRM_BASE = "https://router.project-osrm.org";

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function haversineMatrix(points) {
  const n = points.length;
  const dist = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) dist[i][j] = haversineKm(points[i], points[j]) * 1000; // metros
    }
  }
  return dist;
}

/** Consulta o endpoint /table do OSRM — equivalente exato ao passo 2 do script Python. */
async function fetchDistanceMatrix(points) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=distance,duration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Serviço de matriz do OSRM indisponível");
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(data.message || "Erro do OSRM ao montar a matriz");
  return { distances: data.distances, durations: data.durations };
}

/** Busca a geometria real (rua a rua) para desenhar a rota já otimizada no mapa. */
async function fetchRouteGeometry(orderedPoints) {
  const coords = orderedPoints.map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Serviço de rota do OSRM indisponível");
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(data.message || "Erro do OSRM ao traçar a rota");
  return data.routes[0];
}

/* ---------------- solver local (nearest-neighbor + 2-opt) ---------------- */
// Mesma lógica de fundo do OR-Tools do script Python (construção gulosa +
// busca local), simplificada para rodar no navegador sem dependências.
// O ponto 0 da matriz é sempre o início fixo (depósito ou 1ª parada).

function nearestNeighborOrder(matrix) {
  const n = matrix.length;
  const visited = new Array(n).fill(false);
  visited[0] = true;
  const order = [0];
  let current = 0;
  for (let k = 1; k < n; k++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[current][j] < bestD) {
        bestD = matrix[current][j];
        best = j;
      }
    }
    visited[best] = true;
    order.push(best);
    current = best;
  }
  return order;
}

/**
 * 2-opt com início fixo em order[0]. Se `roundtrip` for true, considera
 * também o custo de voltar do último ponto ao primeiro (rota fechada);
 * caso contrário trata como caminho aberto (o motorista não volta à base).
 */
function twoOpt(order, matrix, roundtrip, maxPasses = 150) {
  const n = order.length;
  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    outer: for (let i = 1; i < n - 1; i++) {
      const prev = order[i - 1];
      for (let j = i + 1; j < n; j++) {
        const b = order[i];
        const c = order[j];
        let nextExists = false;
        let nxt = null;
        if (j + 1 < n) {
          nxt = order[j + 1];
          nextExists = true;
        } else if (roundtrip) {
          nxt = order[0];
          nextExists = true;
        }
        const before = matrix[prev][b] + (nextExists ? matrix[c][nxt] : 0);
        const after = matrix[prev][c] + (nextExists ? matrix[b][nxt] : 0);
        if (after < before - 1e-6) {
          const seg = order.slice(i, j + 1).reverse();
          order.splice(i, seg.length, ...seg);
          improved = true;
          break outer; // recomeça o exame com a rota já melhorada
        }
      }
    }
  }
  return order;
}

function routeLength(order, matrix, roundtrip) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += matrix[order[i]][order[i + 1]];
  if (roundtrip) total += matrix[order[order.length - 1]][order[0]];
  return total;
}

function solveTsp(matrix, roundtrip) {
  let order = nearestNeighborOrder(matrix);
  order = twoOpt(order, matrix, roundtrip);
  const totalMeters = routeLength(order, matrix, roundtrip);
  return { order, totalMeters };
}

/**
 * Função principal chamada pela UI: recebe os pontos já geocodificados
 * (depósito opcional em points[0] + paradas) e devolve a ordem otimizada,
 * a distância/tempo total e a geometria para desenhar no mapa.
 *
 * points: [{lat, lon, ref}] — `ref` identifica a que parada cada ponto pertence.
 */
export async function optimize(points, roundtrip) {
  if (points.length < 2) throw new Error("São necessários ao menos 2 pontos geocodificados.");

  let matrix;
  let usedOsrm = true;
  let durMatrix = null;
  try {
    const { distances, durations } = await fetchDistanceMatrix(points);
    matrix = distances;
    durMatrix = durations;
  } catch (e) {
    matrix = haversineMatrix(points);
    usedOsrm = false;
  }

  const { order, totalMeters } = solveTsp(matrix, roundtrip);

  let totalSeconds;
  if (durMatrix) {
    totalSeconds = 0;
    for (let i = 0; i < order.length - 1; i++) totalSeconds += durMatrix[order[i]][order[i + 1]];
    if (roundtrip) totalSeconds += durMatrix[order[order.length - 1]][order[0]];
  } else {
    // sem dados reais de trânsito: estima ~35 km/h médio urbano
    totalSeconds = (totalMeters / 1000 / 35) * 3600;
  }

  const orderedPoints = order.map((idx) => points[idx]);

  let geometry = null;
  try {
    if (usedOsrm) {
      const route = await fetchRouteGeometry(orderedPoints);
      geometry = route.geometry;
    }
  } catch (e) {
    geometry = null; // sem geometria real — a UI desenha uma linha reta entre os pontos
  }

  return {
    order,
    orderedPoints,
    totalKm: totalMeters / 1000,
    totalMin: totalSeconds / 60,
    geometry,
    usedOsrm,
  };
}

/** Recalcula só a geometria/distância para uma ordem já definida manualmente (drag-and-drop). */
export async function recomputeForFixedOrder(orderedPoints) {
  if (orderedPoints.length < 2) return { geometry: null, totalKm: null, totalMin: null };
  try {
    const route = await fetchRouteGeometry(orderedPoints);
    return { geometry: route.geometry, totalKm: route.distance / 1000, totalMin: route.duration / 60 };
  } catch (e) {
    let totalKm = 0;
    for (let i = 0; i < orderedPoints.length - 1; i++) totalKm += haversineKm(orderedPoints[i], orderedPoints[i + 1]);
    return { geometry: null, totalKm, totalMin: (totalKm / 35) * 60 };
  }
}
