/**
 * MYCHAL SMP – Přehled stavu služeb a síťového zapojení (Read-Only)
 * Anti-AI Slop & Apple Craftsmanship standardy dle AGENTS.md
 */

const STATUS_API_ENDPOINTS = [
  "https://voice.mychalsmp.xyz/api/v1/status",
  "https://pvp.mychalsmp.xyz/api/v1/status"
];
const STATUS_API_KEY = "msmp_stat_v1_9f8e2a4b7c1d6e3f5a0b";

let currentView = "columns";
let latestTelemetry = null;
const expandedServices = new Set();
let hasInitializedAutoExpand = false;

// Veřejné popisky a informace o směrování dle AGENTS.md
const PUBLIC_LABELS = {
  minecraft_smp: {
    name: "Minecraft SMP Server",
    desc: "Hlavní survival svět (mychalsmp.xyz)",
    route: "TCPShield Edge → Notebook (10.9.0.3)"
  },
  minecraft_pvp: {
    name: "Minecraft PvP Server",
    desc: "Duely a bojové arény (pvp.mychalsmp.xyz)",
    route: "Oracle VPS (Port 25566) → Skříň (10.9.0.2)"
  },
  voice_chat: {
    name: "Voice Chat ve hře",
    desc: "Prostorový hlasový chat na SMP",
    route: "Oracle VPS (UDP 24454) → Notebook (10.9.0.3)"
  },
  auth_api: {
    name: "Přihlašování a účty",
    desc: "Ověřování hráčů & ViAuth SSO brána",
    route: "Cloudflare Edge → Skříň ViAuth (Port 3070)"
  },
  discord_bot: {
    name: "Discord Bot & Propojení serverů",
    desc: "Synchronizace statistik, kitů a přenosů mezi servery",
    route: "Lokální REST API (Port 3000) → Skříň"
  },
  api_6767111: {
    name: "Webové rozhraní a statistiky",
    desc: "Napojení webu na herní databázi",
    route: "Cloudflare Edge → Skříň Databáze"
  },
  vps_smp: {
    name: "Vstupní brána SMP",
    desc: "Směrování a ochrana připojení na hlavní server"
  },
  vpn_tunnel: {
    name: "Vstupní brána PvP & Voice",
    desc: "Směrování PvP serveru a hlasového chatu"
  },
  home_nb: {
    name: "Hlavní herní server",
    desc: "Fyzický server pro běh SMP a Voice Chatu (Notebook)"
  },
  home_pc: {
    name: "Záložní herní server",
    desc: "Záložní server připravený převzít SMP při údržbě (Herní PC)"
  },
  vpn_lenovo: {
    name: "Server systémových služeb",
    desc: "Fyzický server pro PvP, přihlašování a Discord bota (Skříň)"
  }
};

// 11 přímých nestínících patch kabelů v 3-vrstvé topologii
const PATCH_CABLES = [
  // 1. Vstupní brány -> Fyzické servery
  {
    id: "c_smp_main",
    fromPort: "port-vps_smp-nb",
    toPort: "port-home_nb-in_smp",
    fromNode: "vps_smp",
    toNode: "home_nb",
    label: "SMP WireGuard tunel (TCP 25565)",
    packetDuration: 1.8
  },
  {
    id: "c_smp_standby",
    fromPort: "port-vps_smp-pc",
    toPort: "port-home_pc-in",
    fromNode: "vps_smp",
    toNode: "home_pc",
    label: "Záložní SMP trasa (Standby)",
    packetDuration: 2.6
  },
  {
    id: "c_voice_wire",
    fromPort: "port-vpn_tunnel-voice",
    toPort: "port-home_nb-in_voice",
    fromNode: "vpn_tunnel",
    toNode: "home_nb",
    label: "Voice Chat UDP tunel (24454)",
    packetDuration: 1.6
  },
  {
    id: "c_pvp_wire",
    fromPort: "port-vpn_tunnel-pvp",
    toPort: "port-vpn_lenovo-in_pvp",
    fromNode: "vpn_tunnel",
    toNode: "vpn_lenovo",
    label: "PvP WireGuard tunel (25566)",
    packetDuration: 2.1
  },
  {
    id: "c_web_wire",
    fromPort: "port-api_6767111-lenovo",
    toPort: "port-vpn_lenovo-in_web",
    fromNode: "api_6767111",
    toNode: "vpn_lenovo",
    label: "Cloudflare HTTPS tunel",
    packetDuration: 1.9
  },

  // 2. Fyzické servery -> Koncové služby
  {
    id: "c_nb_smp",
    fromPort: "port-home_nb-out_smp",
    toPort: "port-minecraft_smp-in_nb",
    fromNode: "home_nb",
    toNode: "minecraft_smp",
    label: "Lokální proces SMP (25565)",
    packetDuration: 1.4
  },
  {
    id: "c_nb_voice",
    fromPort: "port-home_nb-out_voice",
    toPort: "port-voice_chat-in",
    fromNode: "home_nb",
    toNode: "voice_chat",
    label: "Lokální Voice Chat (24454)",
    packetDuration: 1.5
  },
  {
    id: "c_pc_smp",
    fromPort: "port-home_pc-out",
    toPort: "port-minecraft_smp-in_pc",
    fromNode: "home_pc",
    toNode: "minecraft_smp",
    label: "Záložní instance SMP",
    packetDuration: 2.7
  },
  {
    id: "c_lenovo_pvp",
    fromPort: "port-vpn_lenovo-out_pvp",
    toPort: "port-minecraft_pvp-in",
    fromNode: "vpn_lenovo",
    toNode: "minecraft_pvp",
    label: "Lokální proces PvP (25566)",
    packetDuration: 2.0
  },
  {
    id: "c_lenovo_auth",
    fromPort: "port-vpn_lenovo-out_auth",
    toPort: "port-auth_api-in",
    fromNode: "vpn_lenovo",
    toNode: "auth_api",
    label: "ViAuth SSO služba (3070)",
    packetDuration: 1.8
  },
  {
    id: "c_lenovo_bot",
    fromPort: "port-vpn_lenovo-out_bot",
    toPort: "port-discord_bot-in",
    fromNode: "vpn_lenovo",
    toNode: "discord_bot",
    label: "Discord Bot & REST API (3000)",
    packetDuration: 2.0
  }
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
    uptimeEl.style.color =
      sum.overall_uptime_pct >= 99
        ? "var(--green)"
        : sum.overall_uptime_pct >= 95
        ? "var(--blue)"
        : "var(--red)";
  }
}

function toggleServiceDetail(svcId) {
  const row = document.getElementById(`svc-row-${svcId}`);
  if (!row) return;

  const isExpanded = expandedServices.has(svcId);
  const btn = row.querySelector(".service-row-head");

  if (isExpanded) {
    expandedServices.delete(svcId);
    row.classList.remove("is-expanded");
    if (btn) btn.setAttribute("aria-expanded", "false");
  } else {
    expandedServices.add(svcId);
    row.classList.add("is-expanded");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  updateToggleAllBtn();
}

function toggleAllServiceDetails() {
  const rows = document.querySelectorAll(".service-row");
  if (rows.length === 0) return;

  const anyClosed = Array.from(rows).some((r) => !r.classList.contains("is-expanded"));

  rows.forEach((row) => {
    const svcId = row.getAttribute("data-service-id");
    const btn = row.querySelector(".service-row-head");
    if (anyClosed) {
      expandedServices.add(svcId);
      row.classList.add("is-expanded");
      if (btn) btn.setAttribute("aria-expanded", "true");
    } else {
      expandedServices.delete(svcId);
      row.classList.remove("is-expanded");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  });

  updateToggleAllBtn();
}

function updateToggleAllBtn() {
  const rows = document.querySelectorAll(".service-row");
  const textEl = document.getElementById("toggle-all-text");
  if (!textEl || rows.length === 0) return;

  const anyClosed = Array.from(rows).some((r) => !r.classList.contains("is-expanded"));
  textEl.textContent = anyClosed ? "Rozbalit všechny grafy" : "Sbalit všechny grafy";
}

function renderColumnsView(data) {
  const listEl = document.getElementById("services-list");
  if (!listEl) return;

  const colsCount = data.columns_count || 48;
  const rawServices = data.services || [];

  // Zobrazujeme 6 klíčových služeb pro hráče (ne interní síťové uzly)
  const allowedIds = ["minecraft_smp", "minecraft_pvp", "voice_chat", "auth_api", "discord_bot", "api_6767111"];
  const services = rawServices.filter(
    (s) => (s.category === "game" || s.category === "core") || allowedIds.includes(s.id)
  );

  const stateNames = {
    operational: "Běží",
    down: "Výpadek",
    standby: "Záložní"
  };

  // Na prvním načtení automaticky rozbalíme služby ve výpadku, aby hráč hned viděl příčinu
  if (!hasInitializedAutoExpand) {
    services.forEach((s) => {
      if (s.state === "down") {
        expandedServices.add(s.id);
      }
    });
    hasInitializedAutoExpand = true;
  }

  const countLabel = document.getElementById("services-count-label");
  if (countLabel) {
    countLabel.textContent = `${services.length} klíčových služeb`;
  }

  listEl.innerHTML = services
    .map((svc) => {
      const pub = PUBLIC_LABELS[svc.id] || { name: svc.name, desc: svc.role, route: "Dedikovaná síť" };
      const stText = stateNames[svc.state] || "Běží";
      const uptimeText = svc.standby && !svc.up ? "Připraven" : `${Number(svc.uptime_pct).toFixed(1)} %`;
      const bars = svc.bars || [];
      const startLabel = bars.length ? formatDateTimeCs(bars[0].ts) : "Před 24 hodinami";
      const isExpanded = expandedServices.has(svc.id);

      const colsHtml = bars
        .map(
          (bar, idx) =>
            `<div class="uptime-col" data-status="${bar.status}" data-idx="${idx}"><span class="uptime-col-fill"></span></div>`
        )
        .join("");

      const defaultFoot =
        svc.latency_ms != null ? `Odezva ${svc.latency_ms} ms` : "Přejeď myší přes sloupec pro detail";

      const latencyBadge =
        svc.latency_ms != null ? `<span class="service-latency-pill">${svc.latency_ms} ms</span>` : "";

      const avgLatText =
        svc.avg_latency_ms != null
          ? `${Number(svc.avg_latency_ms).toFixed(0)} ms`
          : svc.latency_ms != null
          ? `${svc.latency_ms} ms`
          : "N/A";

      const outagesCount = bars.filter((b) => b.status === "down" || b.status === "degraded").length;

      return `
      <article class="service-row ${isExpanded ? "is-expanded" : ""}" id="svc-row-${svc.id}" data-service-id="${svc.id}" data-state="${svc.state}">
        <!-- Kompaktní hlavička s okamžitým stavem (vždy viditelná) -->
        <button type="button" class="service-row-head" onclick="toggleServiceDetail('${svc.id}')" aria-expanded="${isExpanded ? "true" : "false"}">
          <div class="service-row-left">
            <span class="service-state-dot" aria-hidden="true"></span>
            <div class="service-title-wrap">
              <h2 class="service-name">${pub.name}</h2>
              <span class="service-desc">${pub.desc}</span>
            </div>
          </div>
          <div class="service-row-right tabular-nums">
            ${latencyBadge}
            <span class="service-uptime">${uptimeText}</span>
            <span class="service-state-badge service-state--${svc.state}">
              <span>${stText}</span>
            </span>
            <span class="service-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </button>

        <!-- Rozbalovací detail s grafem dostupnosti a technickými metrikami -->
        <div class="service-detail-drawer" id="drawer-${svc.id}">
          <div class="service-drawer-inner">

            <!-- Bento Spec Bar se stručnými údaji o uzlu -->
            <div class="service-spec-grid">
              <div class="spec-cell">
                <span class="spec-label">Dostupnost (24h)</span>
                <strong class="spec-value ${svc.uptime_pct >= 99 ? "val-green" : svc.uptime_pct >= 95 ? "val-blue" : "val-red"}">${Number(svc.uptime_pct).toFixed(2)} %</strong>
              </div>
              <div class="spec-cell">
                <span class="spec-label">Průměrná latence</span>
                <strong class="spec-value tabular-nums">${avgLatText}</strong>
              </div>
              <div class="spec-cell">
                <span class="spec-label">Směrování a uzel</span>
                <strong class="spec-value spec-value--route">${pub.route || "Dedikovaný uzel"}</strong>
              </div>
              <div class="spec-cell">
                <span class="spec-label">Incidenty za 24h</span>
                <strong class="spec-value ${outagesCount === 0 ? "val-green" : "val-red"}">${outagesCount === 0 ? "Bez incidentu" : `${outagesCount} intervalů výpadku`}</strong>
              </div>
            </div>

            <!-- Časová osa s 48 sloupci historie -->
            <div class="service-graph-wrap">
              <div class="graph-legend-strip">
                <span class="graph-legend-title">Historie dostupnosti za posledních 24 hodin</span>
                <span class="col-hover-info tabular-nums" id="hover-${svc.id}" data-default="${defaultFoot}">${defaultFoot}</span>
              </div>
              <div class="uptime-columns-track" style="--cols:${colsCount}">
                ${colsHtml}
              </div>
              <div class="service-row-foot tabular-nums">
                <span>${startLabel}</span>
                <span class="graph-hint">Přejeď myší přes sloupec pro podrobnou odezvu</span>
                <span>Nyní</span>
              </div>
            </div>

          </div>
        </div>
      </article>
    `;
    })
    .join("");

  updateToggleAllBtn();

  const svcMap = {};
  services.forEach((s) => {
    svcMap[s.id] = s;
  });

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
        const st =
          bar.status === "down"
            ? "Výpadek"
            : bar.status === "degraded"
            ? `Částečný výpadek (${bar.uptime}%)`
            : bar.status === "standby"
            ? "Záložní režim"
            : "V provozu";
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
  listEl.innerHTML = incidents
    .slice(0, 6)
    .map((inc) => {
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
    })
    .join("");
}

// Čistá Bezierova křivka pro realistické kabely s přirozeným průvěsem
function buildFiliusCablePath(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const vertDrop = Math.max(22, Math.min(54, Math.abs(dy) * 0.45 + Math.abs(dx) * 0.04));

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
  const coreColor = state === "down" ? "#f51515" : state === "standby" ? "#0a67e5" : "#21DE00";

  if (!isTarget) {
    // Port 1 (Výstup): konektor směřuje dolů
    return `
      <g class="filius-rj45-plug" data-cable="${cableId}">
        <rect x="${(x - 6).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="12" height="5" rx="1.5" fill="#090a0d" stroke="rgba(255,255,255,0.22)" stroke-width="0.9" />
        <rect x="${(x - 3).toFixed(1)}" y="${y.toFixed(1)}" width="6" height="6.5" rx="1.2" fill="url(#rj45-boot-grad)" stroke="rgba(255,255,255,0.14)" stroke-width="0.6" />
        <rect x="${(x - 2.5).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="5" height="2.5" rx="0.6" fill="#1b1e28" stroke="${coreColor}" stroke-width="0.7" />
        <circle cx="${(x - 8).toFixed(1)}" cy="${(y - 1).toFixed(1)}" r="1.4" fill="${coreColor}" filter="url(#filius-glow-${state === "down" ? "red" : state === "standby" ? "blue" : "green"})" />
      </g>
    `;
  } else {
    // Port 2 (Vstup): konektor vstupuje shora
    return `
      <g class="filius-rj45-plug" data-cable="${cableId}">
        <rect x="${(x - 6).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="12" height="5" rx="1.5" fill="#090a0d" stroke="rgba(255,255,255,0.22)" stroke-width="0.9" />
        <rect x="${(x - 3).toFixed(1)}" y="${(y - 6.5).toFixed(1)}" width="6" height="6.5" rx="1.2" fill="url(#rj45-boot-grad)" stroke="rgba(255,255,255,0.14)" stroke-width="0.6" />
        <rect x="${(x - 2.5).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="5" height="2.5" rx="0.6" fill="#1b1e28" stroke="${coreColor}" stroke-width="0.7" />
        <circle cx="${(x - 8).toFixed(1)}" cy="${(y + 1).toFixed(1)}" r="1.4" fill="${coreColor}" filter="url(#filius-glow-${state === "down" ? "red" : state === "standby" ? "blue" : "green"})" />
      </g>
    `;
  }
}

function inspectCable(cableId) {
  const cable = PATCH_CABLES.find((c) => c.id === cableId);
  if (!cable) return;

  document.querySelectorAll(".cables-svg-layer [data-cable]").forEach((el) => {
    if (el.getAttribute("data-cable") === cableId) {
      el.classList.add("is-highlighted");
      el.classList.remove("is-dimmed");
    } else {
      el.classList.remove("is-highlighted");
      el.classList.add("is-dimmed");
    }
  });

  document.querySelectorAll(".topo-node").forEach((node) => {
    const id = node.getAttribute("data-node-id");
    if (id === cable.fromNode || id === cable.toNode) {
      node.classList.add("is-connected");
    } else {
      node.classList.remove("is-connected");
    }
  });
}

function resetCableInspection() {
  document.querySelectorAll(".cables-svg-layer [data-cable]").forEach((el) => {
    el.classList.remove("is-highlighted", "is-dimmed");
  });
  document.querySelectorAll(".topo-node").forEach((node) => {
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

  // Aktualizace stavů uzlů na desce
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
    const coreColor = cableState === "down" ? "#f51515" : cableState === "standby" ? "#0a67e5" : "#21DE00";
    const jacketColor = cableState === "down" ? "#2d1014" : cableState === "standby" ? "#121824" : "#161922";
    const dash =
      cableState === "down"
        ? `stroke-dasharray="7 6"`
        : cableState === "standby"
        ? `stroke-dasharray="4 6"`
        : "";
    const opacity = cableState === "standby" ? "0.6" : "0.95";
    const dur = cable.packetDuration || 2.0;

    shadowsHtml += `<path class="cable-shadow-path" data-cable="${cable.id}" d="${geom.d}" />`;
    jacketsHtml += `<path class="cable-jacket-path" data-cable="${cable.id}" d="${geom.d}" style="stroke:${jacketColor}" />`;
    coresHtml += `<path class="cable-core-path" data-cable="${cable.id}" d="${geom.d}" style="stroke:${coreColor};opacity:${opacity}" ${dash} />`;

    // Pohybující se datové pakety podél kabelu (běží na funkčních i standby linkách)
    if (cableState === "up" || cableState === "standby") {
      packetsHtml += `
        <path class="filius-packet-glow ${cableState === "standby" ? "packet--standby" : ""}" data-cable="${cable.id}" d="${geom.d}" style="animation-duration:${dur}s" />
        <path class="filius-packet-trail ${cableState === "standby" ? "packet--standby" : ""}" data-cable="${cable.id}" d="${geom.d}" style="animation-duration:${dur}s" />
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
          <rect x="-44" y="-11" width="88" height="22" rx="5" fill="#180709" stroke="#f51515" stroke-width="1.2" />
          <text x="0" y="3.8" text-anchor="middle" fill="#f51515" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700">VÝPADEK LINKY</text>
        </g>
      `;
    }
  });

  const shadowsEl = document.getElementById("cables-shadows-group");
  const jacketsEl = document.getElementById("cables-jackets-group");
  const coresEl = document.getElementById("cables-cores-group");
  const packetsEl = document.getElementById("cables-packets-group");
  const plugsEl = document.getElementById("cables-plugs-group");
  const badgesEl = document.getElementById("cables-badges-group");
  const interactiveEl = document.getElementById("cables-interactive-group");

  if (shadowsEl) shadowsEl.innerHTML = shadowsHtml;
  if (jacketsEl) jacketsEl.innerHTML = jacketsHtml;
  if (coresEl) coresEl.innerHTML = coresHtml;
  if (packetsEl) packetsEl.innerHTML = packetsHtml;
  if (plugsEl) plugsEl.innerHTML = plugsHtml;
  if (badgesEl) badgesEl.innerHTML = badgesHtml;
  if (interactiveEl) interactiveEl.innerHTML = interactiveHtml;

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
