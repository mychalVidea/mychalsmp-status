/**
 * MYCHAL SMP – Přehled stavu služeb a síťového zapojení (Read-Only)
 */

const STATUS_API_ENDPOINTS = [
  "https://voice.mychalsmp.xyz/api/v1/status",
  "https://pvp.mychalsmp.xyz/api/v1/status"
];
const STATUS_API_KEY = "msmp_stat_v1_9f8e2a4b7c1d6e3f5a0b";

let currentView = "columns";
let latestTelemetry = null;

// Čisté veřejné názvy bez interních codenames
const PUBLIC_LABELS = {
  minecraft_smp: {
    name: "Minecraft SMP Server",
    desc: "Hlavní survival svět (mychalsmp.xyz)"
  },
  minecraft_pvp: {
    name: "Minecraft PvP Server",
    desc: "Duely a bojové arény (pvp.mychalsmp.xyz)"
  },
  voice_chat: {
    name: "Voice Chat ve hře",
    desc: "Prostorový hlasový chat na SMP"
  },
  auth_api: {
    name: "Přihlašování a účty",
    desc: "Ověřování hráčů při vstupu na server"
  },
  discord_bot: {
    name: "Discord Bot & Propojení serverů",
    desc: "Synchronizace statistik, kitů a přenosů mezi servery"
  },
  api_6767111: {
    name: "Webové rozhraní a statistiky",
    desc: "Napojení webu na herní databázi"
  },
  vps_smp: {
    name: "Vstupní brána SMP",
    desc: "Směrování a ochrana připojení na hlavní server"
  },
  vpn_tunnel: {
    name: "Vstupní brána PvP & Voice",
    desc: "Směrování PvP serveru a hlasového chatu"
  },
  home_internet: {
    name: "Hlavní síťové spojení",
    desc: "Propojení vstupních bran s fyzickými servery"
  },
  home_nb: {
    name: "Hlavní herní stroj",
    desc: "Fyzický server pro běh SMP a Voice Chatu"
  },
  vpn_lenovo: {
    name: "Server systémových služeb",
    desc: "Fyzický server pro PvP, přihlašování a Discord bota"
  },
  home_pc: {
    name: "Záložní herní stroj",
    desc: "Záložní server připravený převzít SMP při údržbě"
  }
};

const PATCH_CABLES = [
  { id: "c1", fromPort: "port-vps_smp-out", toPort: "port-home_internet-in1", fromNode: "vps_smp", toNode: "home_internet", label: "Vstupní brána SMP", packetDuration: 2.1 },
  { id: "c2", fromPort: "port-vpn_tunnel-out", toPort: "port-home_internet-in2", fromNode: "vpn_tunnel", toNode: "home_internet", label: "Vstupní brána PvP & Voice", packetDuration: 2.3 },
  { id: "c3", fromPort: "port-api_6767111-out", toPort: "port-home_internet-in3", fromNode: "api_6767111", toNode: "home_internet", label: "Webová brána", packetDuration: 2.0 },
  { id: "c4", fromPort: "port-home_internet-out1", toPort: "port-home_nb-in", fromNode: "home_internet", toNode: "home_nb", label: "Hlavní herní server", packetDuration: 1.8 },
  { id: "c5", fromPort: "port-home_internet-out2", toPort: "port-vpn_lenovo-in", fromNode: "home_internet", toNode: "vpn_lenovo", label: "Server systémových služeb", packetDuration: 1.9 },
  { id: "c6", fromPort: "port-home_internet-out3", toPort: "port-home_pc-in", fromNode: "home_internet", toNode: "home_pc", label: "Záložní herní server", packetDuration: 2.5 },
  { id: "c7", fromPort: "port-home_nb-out1", toPort: "port-minecraft_smp-in1", fromNode: "home_nb", toNode: "minecraft_smp", label: "Minecraft SMP", packetDuration: 1.5 },
  { id: "c8", fromPort: "port-home_nb-out2", toPort: "port-voice_chat-in", fromNode: "home_nb", toNode: "voice_chat", label: "Voice Chat", packetDuration: 1.7 },
  { id: "c9", fromPort: "port-home_pc-out1", toPort: "port-minecraft_smp-in2", fromNode: "home_pc", toNode: "minecraft_smp", label: "Záložní trasa SMP", packetDuration: 2.8 },
  { id: "c10", fromPort: "port-vpn_lenovo-out1", toPort: "port-minecraft_pvp-in", fromNode: "vpn_lenovo", toNode: "minecraft_pvp", label: "Minecraft PvP", packetDuration: 2.2 },
  { id: "c11", fromPort: "port-vpn_lenovo-out2", toPort: "port-auth_api-in", fromNode: "vpn_lenovo", toNode: "auth_api", label: "Přihlašování a účty", packetDuration: 2.2 },
  { id: "c12", fromPort: "port-vpn_lenovo-out3", toPort: "port-discord_bot-in", fromNode: "vpn_lenovo", toNode: "discord_bot", label: "Discord Bot", packetDuration: 2.0 }
];

function switchView(viewName, index) {
  currentView = viewName;
  const pill = document.getElementById("view-switcher-pill");
  if (pill) {
    pill.style.transform = `translate3d(${index * 100}%, 0, 0)`;
  }

  const btnCols = document.getElementById("btn-view-columns");
  const btnCables = document.getElementById("btn-view-cables");
  const panelCols = document.getElementById("view-columns");
  const panelCables = document.getElementById("view-cables");

  if (viewName === "columns") {
    btnCols.classList.add("is-active");
    btnCols.setAttribute("aria-selected", "true");
    btnCables.classList.remove("is-active");
    btnCables.setAttribute("aria-selected", "false");

    panelCols.classList.add("is-active");
    panelCols.setAttribute("aria-hidden", "false");
    panelCables.classList.remove("is-active");
    panelCables.setAttribute("aria-hidden", "true");
  } else {
    btnCables.classList.add("is-active");
    btnCables.setAttribute("aria-selected", "true");
    btnCols.classList.remove("is-active");
    btnCols.setAttribute("aria-selected", "false");

    panelCables.classList.add("is-active");
    panelCables.setAttribute("aria-hidden", "false");
    panelCols.classList.remove("is-active");
    panelCols.setAttribute("aria-hidden", "true");

    requestAnimationFrame(() => {
      renderPatchbayTopology();
    });
  }
}

async function fetchStatusData(colsCount) {
  for (const baseUrl of STATUS_API_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(`${baseUrl}?range=24h&cols=${colsCount}`, {
        headers: { "X-Status-Key": STATUS_API_KEY },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (json && json.ok) return json;
      }
    } catch (_) {
      clearTimeout(timer);
    }
  }
  throw new Error("API unreachable");
}

function formatTimeCs(unixSec) {
  if (!unixSec) return "--";
  return new Date(unixSec * 1000).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTimeCs(unixSec) {
  if (!unixSec) return "--";
  return new Date(unixSec * 1000).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDurationCs(sec) {
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} h ${rem} min` : `${hrs} h`;
}

function renderBanner(data) {
  const sum = data.summary || {};
  const banner = document.getElementById("status-banner");
  const titleEl = document.getElementById("hero-title");
  const updatedEl = document.getElementById("hero-updated");
  const uptimeEl = document.getElementById("hero-uptime");

  if (banner) banner.setAttribute("data-state", sum.state || "operational");
  if (titleEl) titleEl.textContent = sum.label || "Všechny systémy v provozu";
  if (updatedEl) {
    updatedEl.textContent = `Poslední kontrola v ${formatTimeCs(data.last_probe_ts)} • Aktualizace každých 5 minut`;
  }
  if (uptimeEl) {
    uptimeEl.textContent = `${Number(sum.overall_uptime_pct || 100).toFixed(2)} %`;
    uptimeEl.style.color = sum.overall_uptime_pct >= 99 ? "var(--green)" : (sum.overall_uptime_pct >= 95 ? "var(--blue)" : "var(--red)");
  }
}

function renderColumnsView(data) {
  const listEl = document.getElementById("services-list");
  if (!listEl) return;

  const colsCount = data.columns_count || 48;
  const services = data.services || [];

  const stateNames = {
    operational: "Běží",
    down: "Výpadek",
    standby: "Záložní"
  };

  listEl.innerHTML = services.map((svc) => {
    const pub = PUBLIC_LABELS[svc.id] || { name: svc.name, desc: svc.role };
    const stText = stateNames[svc.state] || "Běží";
    const uptimeText = svc.standby && !svc.up ? "Připraven" : `${Number(svc.uptime_pct).toFixed(1)} %`;
    const bars = svc.bars || [];
    const startLabel = bars.length ? formatDateTimeCs(bars[0].ts) : "";

    const colsHtml = bars.map((bar, idx) => (
      `<div class="uptime-col" data-status="${bar.status}" data-idx="${idx}"><span class="uptime-col-fill"></span></div>`
    )).join("");

    const defaultFoot = svc.latency_ms != null ? `Odezva ${svc.latency_ms} ms` : "Přejeď myší přes sloupec pro detail";

    return `
      <article class="service-row" data-service-id="${svc.id}" data-state="${svc.state}">
        <div class="service-row-head">
          <div class="service-row-title">
            <h2 class="service-name">${pub.name}</h2>
            <span class="service-desc">${pub.desc}</span>
          </div>
          <div class="service-row-right tabular-nums">
            <span class="service-uptime">${uptimeText}</span>
            <span class="service-state service-state--${svc.state}">
              <span class="service-state-dot"></span>
              <span>${stText}</span>
            </span>
          </div>
        </div>
        <div class="uptime-columns-track" style="--cols:${colsCount}">
          ${colsHtml}
        </div>
        <div class="service-row-foot tabular-nums">
          <span>${startLabel}</span>
          <span class="col-hover-info" id="hover-${svc.id}" data-default="${defaultFoot}">${defaultFoot}</span>
          <span>Nyní</span>
        </div>
      </article>
    `;
  }).join("");

  const svcMap = {};
  services.forEach((s) => { svcMap[s.id] = s; });

  listEl.querySelectorAll(".service-row").forEach((row) => {
    const svcId = row.getAttribute("data-service-id");
    const svc = svcMap[svcId];
    const infoEl = document.getElementById(`hover-${svcId}`);
    if (!svc || !infoEl) return;
    const defText = infoEl.getAttribute("data-default");

    row.querySelectorAll(".uptime-col").forEach((col) => {
      col.addEventListener("mouseenter", () => {
        const bar = (svc.bars || [])[Number(col.getAttribute("data-idx"))];
        if (!bar) return;
        const t = `${formatDateTimeCs(bar.ts)} – ${formatTimeCs(bar.ts_end)}`;
        const st = bar.status === "down" ? "Výpadek" : (bar.status === "degraded" ? `Částečný výpadek (${bar.uptime}%)` : (bar.status === "standby" ? "Záložní režim" : "V provozu"));
        const lat = bar.latency_ms != null ? ` • ${bar.latency_ms} ms` : "";
        infoEl.textContent = `${t} • ${st}${lat}`;
      });
    });

    row.addEventListener("mouseleave", () => {
      infoEl.textContent = defText;
    });
  });
}

function renderIncidents(incidents) {
  const boxEl = document.getElementById("incidents-box");
  const listEl = document.getElementById("incidents-list");
  if (!boxEl || !listEl) return;

  if (!incidents || incidents.length === 0) {
    boxEl.hidden = true;
    return;
  }

  boxEl.hidden = false;
  listEl.innerHTML = incidents.slice(0, 6).map((inc) => {
    const pub = PUBLIC_LABELS[inc.service_id] || { name: inc.service_name };
    const isResolved = Boolean(inc.resolved);
    const statusText = isResolved ? "Vyřešeno" : "Probíhá výpadek";
    const statusColor = isResolved ? "var(--green)" : "var(--red)";
    const timeText = inc.end_ts
      ? `${formatDateTimeCs(inc.start_ts)} – ${formatTimeCs(inc.end_ts)} (${formatDurationCs(inc.duration_sec)})`
      : `Od ${formatDateTimeCs(inc.start_ts)} dosud`;

    return `
      <div class="incident-row ${isResolved ? "" : "incident-row--active"}">
        <span class="incident-name">${pub.name}</span>
        <span class="incident-meta tabular-nums">${timeText} &bull; <strong style="color:${statusColor}">${statusText}</strong></span>
      </div>
    `;
  }).join("");
}

function buildFiliusCablePath(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const vertDrop = Math.max(18, Math.min(38, Math.abs(dy) * 0.4 + Math.abs(dx) * 0.04));

  const cp1x = x1;
  const cp1y = y1 + vertDrop;
  const cp2x = x2;
  const cp2y = y2 - vertDrop;

  const midX = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
  const midY = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;

  return {
    d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    midX,
    midY,
    dx,
    dy
  };
}

function renderRJ45ConnectorSvg(x, y, isTarget, state, cableId) {
  const coreColor = state === "down" ? "#f51515" : (state === "standby" ? "#0a67e5" : "#21DE00");

  if (!isTarget) {
    // Port 1 (Výstup): kabel směřuje dolů
    return `
      <g class="filius-rj45-plug" data-cable="${cableId}">
        <rect x="${(x - 6).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="12" height="5" rx="1.5" fill="#090a0d" stroke="rgba(255,255,255,0.22)" stroke-width="0.9" />
        <rect x="${(x - 3).toFixed(1)}" y="${y.toFixed(1)}" width="6" height="6.5" rx="1.2" fill="url(#rj45-boot-grad)" stroke="rgba(255,255,255,0.14)" stroke-width="0.6" />
        <rect x="${(x - 2.5).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="5" height="2.5" rx="0.6" fill="#1b1e28" stroke="${coreColor}" stroke-width="0.7" />
        <circle cx="${(x - 8).toFixed(1)}" cy="${(y - 1).toFixed(1)}" r="1.4" fill="${coreColor}" filter="url(#filius-glow-${state === 'down' ? 'red' : (state === 'standby' ? 'blue' : 'green')})" />
      </g>
    `;
  } else {
    // Port 2 (Vstup): kabel vstupuje shora
    return `
      <g class="filius-rj45-plug" data-cable="${cableId}">
        <rect x="${(x - 6).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="12" height="5" rx="1.5" fill="#090a0d" stroke="rgba(255,255,255,0.22)" stroke-width="0.9" />
        <rect x="${(x - 3).toFixed(1)}" y="${(y - 6.5).toFixed(1)}" width="6" height="6.5" rx="1.2" fill="url(#rj45-boot-grad)" stroke="rgba(255,255,255,0.14)" stroke-width="0.6" />
        <rect x="${(x - 2.5).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="5" height="2.5" rx="0.6" fill="#1b1e28" stroke="${coreColor}" stroke-width="0.7" />
        <circle cx="${(x - 8).toFixed(1)}" cy="${(y + 1).toFixed(1)}" r="1.4" fill="${coreColor}" filter="url(#filius-glow-${state === 'down' ? 'red' : (state === 'standby' ? 'blue' : 'green')})" />
      </g>
    `;
  }
}

function inspectCable(cableId) {
  const cable = PATCH_CABLES.find(c => c.id === cableId);
  if (!cable) return;

  document.querySelectorAll(".cables-svg-layer [data-cable]").forEach(el => {
    if (el.getAttribute("data-cable") === cableId) {
      el.classList.add("is-highlighted");
      el.classList.remove("is-dimmed");
    } else {
      el.classList.remove("is-highlighted");
      el.classList.add("is-dimmed");
    }
  });

  document.querySelectorAll(".topo-node").forEach(node => {
    const id = node.getAttribute("data-node-id");
    if (id === cable.fromNode || id === cable.toNode) {
      node.classList.add("is-connected");
    } else {
      node.classList.remove("is-connected");
    }
  });
}

function resetCableInspection() {
  document.querySelectorAll(".cables-svg-layer [data-cable]").forEach(el => {
    el.classList.remove("is-highlighted", "is-dimmed");
  });
  document.querySelectorAll(".topo-node").forEach(node => {
    node.classList.remove("is-connected");
  });
}

function renderPatchbayTopology() {
  const board = document.getElementById("patchbay-board");
  const svg = document.getElementById("cables-svg");
  if (!board || !svg || !latestTelemetry) return;

  const nodeMap = {};
  (latestTelemetry.services || []).forEach((s) => {
    nodeMap[s.id] = s;
  });

  Object.keys(nodeMap).forEach((id) => {
    const s = nodeMap[id];
    const nodeEl = document.getElementById(`node-${id}`);
    const latEl = document.getElementById(`lat-${id}`);
    if (nodeEl) nodeEl.setAttribute("data-state", s.state);
    if (latEl) {
      if (s.state === "down") latEl.textContent = "Výpadek";
      else if (s.state === "standby") latEl.textContent = "Záložní";
      else if (s.latency_ms != null) latEl.textContent = `${s.latency_ms} ms`;
      else latEl.textContent = "Běží";
    }
  });

  const boardRect = board.getBoundingClientRect();
  if (boardRect.width === 0) return;
  svg.setAttribute("viewBox", `0 0 ${Math.round(boardRect.width)} ${Math.round(boardRect.height)}`);

  let shadowsHtml = "";
  let jacketsHtml = "";
  let coresHtml = "";
  let packetsHtml = "";
  let plugsHtml = "";
  let badgesHtml = "";
  let interactiveHtml = "";
  const downNames = [];

  PATCH_CABLES.forEach((cable) => {
    const p1 = document.getElementById(cable.fromPort);
    const p2 = document.getElementById(cable.toPort);
    if (!p1 || !p2) return;

    const r1 = p1.getBoundingClientRect();
    const r2 = p2.getBoundingClientRect();
    const x1 = r1.left - boardRect.left + r1.width / 2;
    const y1 = r1.top - boardRect.top + r1.height / 2;
    const x2 = r2.left - boardRect.left + r2.width / 2;
    const y2 = r2.top - boardRect.top + r2.height / 2;

    const fromSt = nodeMap[cable.fromNode] || { state: "operational" };
    const toSt = nodeMap[cable.toNode] || { state: "operational" };

    let cableState = "up";
    if (fromSt.state === "standby" || toSt.state === "standby") cableState = "standby";
    if (fromSt.state === "down" || toSt.state === "down") {
      if (fromSt.state === "standby" && toSt.state !== "down") cableState = "standby";
      else cableState = "down";
    }

    const geom = buildFiliusCablePath(x1, y1, x2, y2);
    const coreColor = cableState === "down" ? "#f51515" : (cableState === "standby" ? "#0a67e5" : "#21DE00");
    const jacketColor = cableState === "down" ? "#2d1014" : (cableState === "standby" ? "#121824" : "#161922");
    const dash = cableState === "down" ? `stroke-dasharray="7 6"` : (cableState === "standby" ? `stroke-dasharray="4 6"` : "");
    const opacity = cableState === "standby" ? "0.6" : "0.95";
    const dur = cable.packetDuration || 2.2;

    shadowsHtml += `<path class="cable-shadow-path" data-cable="${cable.id}" d="${geom.d}" />`;
    jacketsHtml += `<path class="cable-jacket-path" data-cable="${cable.id}" d="${geom.d}" style="stroke:${jacketColor}" />`;
    coresHtml += `<path class="cable-core-path" data-cable="${cable.id}" d="${geom.d}" style="stroke:${coreColor};opacity:${opacity}" ${dash} />`;

    if (cableState === "up") {
      packetsHtml += `
        <path class="filius-packet-glow" data-cable="${cable.id}" d="${geom.d}" style="animation-duration:${dur}s" />
        <path class="filius-packet-trail" data-cable="${cable.id}" d="${geom.d}" style="animation-duration:${dur}s" />
      `;
    }

    plugsHtml += renderRJ45ConnectorSvg(x1, y1, false, cableState, cable.id);
    plugsHtml += renderRJ45ConnectorSvg(x2, y2, true, cableState, cable.id);

    interactiveHtml += `
      <path class="cable-hit-area" data-cable="${cable.id}" d="${geom.d}"
        onmouseenter="inspectCable('${cable.id}')"
        onmouseleave="resetCableInspection()"
        onclick="inspectCable('${cable.id}')" />
    `;

    if (cableState === "down") {
      downNames.push(cable.label);
      badgesHtml += `
        <g class="filius-fault-badge" data-cable="${cable.id}" transform="translate(${geom.midX.toFixed(1)}, ${geom.midY.toFixed(1)})">
          <rect x="-42" y="-11" width="84" height="22" rx="5" fill="#180709" stroke="#f51515" stroke-width="1.2" />
          <text x="0" y="3.8" text-anchor="middle" fill="#f51515" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700">VÝPADEK LINKY</text>
        </g>
      `;
    }
  });

  document.getElementById("cables-shadows-group").innerHTML = shadowsHtml;
  document.getElementById("cables-jackets-group").innerHTML = jacketsHtml;
  document.getElementById("cables-cores-group").innerHTML = coresHtml;
  document.getElementById("cables-packets-group").innerHTML = packetsHtml;
  document.getElementById("cables-plugs-group").innerHTML = plugsHtml;
  document.getElementById("cables-badges-group").innerHTML = badgesHtml;
  document.getElementById("cables-interactive-group").innerHTML = interactiveHtml;

  const alertStrip = document.getElementById("cable-alert-strip");
  const alertText = document.getElementById("cable-alert-text");
  if (alertStrip && alertText) {
    if (downNames.length > 0) {
      alertStrip.hidden = false;
      alertText.textContent = `Nedostupné síťové spojení: ${[...new Set(downNames)].join(", ")}`;
    } else {
      alertStrip.hidden = true;
    }
  }
}

async function loadTelemetry() {
  const cols = window.innerWidth < 640 ? 32 : 48;
  try {
    const data = await fetchStatusData(cols);
    latestTelemetry = data;
    renderBanner(data);
    renderColumnsView(data);
    renderIncidents(data.incidents || []);
    if (currentView === "cables") {
      renderPatchbayTopology();
    }
  } catch (_) {
    const titleEl = document.getElementById("hero-title");
    if (titleEl && !latestTelemetry) {
      titleEl.textContent = "Nepodařilo se načíst stav služeb";
    }
  }
}

window.addEventListener("resize", () => {
  if (currentView === "cables") {
    requestAnimationFrame(renderPatchbayTopology);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadTelemetry();
  setInterval(loadTelemetry, 45000);
});


