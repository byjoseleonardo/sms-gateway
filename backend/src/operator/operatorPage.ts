function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function operatorPageHtml(version: string) {
  const safeVersion = escapeHtml(version);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>SMS Gateway · Operador</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #071019;
      color: #edf6ff;
      --bg: #071019;
      --panel: #0d1824;
      --panel-2: #111f2e;
      --line: #24364a;
      --muted: #8fa5b9;
      --text: #edf6ff;
      --accent: #57c7ff;
      --accent-2: #7ce5b4;
      --danger: #ff7f86;
      --warning: #f8ca75;
      --purple: #b99cff;
      --shadow: 0 18px 60px rgba(0,0,0,.28);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 0% 0%, rgba(47, 141, 204, .22), transparent 32rem),
        radial-gradient(circle at 100% 15%, rgba(66, 190, 144, .12), transparent 30rem),
        var(--bg);
    }

    button, input, select, textarea {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .shell {
      width: min(1440px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 48px;
    }

    header {
      display: flex;
      gap: 20px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 22px;
    }

    .brand {
      display: flex;
      gap: 14px;
      align-items: center;
    }

    .logo {
      width: 48px;
      height: 48px;
      border-radius: 15px;
      display: grid;
      place-items: center;
      font-weight: 900;
      color: #04131d;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 12px 34px rgba(87,199,255,.22);
    }

    h1 {
      font-size: clamp(1.35rem, 2vw, 1.9rem);
      margin: 0;
      letter-spacing: -.03em;
    }

    .subtitle {
      margin-top: 4px;
      color: var(--muted);
      font-size: .92rem;
    }

    .version {
      color: var(--accent);
      font-variant-numeric: tabular-nums;
    }

    .panel {
      background: linear-gradient(180deg, rgba(17,31,46,.96), rgba(13,24,36,.96));
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: var(--shadow);
    }

    .auth {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      padding: 14px;
      align-items: center;
      margin-bottom: 18px;
    }

    .input, select, textarea {
      width: 100%;
      color: var(--text);
      background: #09131e;
      border: 1px solid #2b4055;
      border-radius: 11px;
      padding: 11px 12px;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
    }

    .input:focus, select:focus, textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(87,199,255,.12);
    }

    textarea {
      min-height: 110px;
      resize: vertical;
    }

    .btn {
      border: 1px solid #31516a;
      color: var(--text);
      background: #132536;
      border-radius: 11px;
      padding: 10px 14px;
      font-weight: 700;
      transition: transform .12s, border-color .12s, background .12s;
    }

    .btn:hover {
      transform: translateY(-1px);
      border-color: #4f7997;
      background: #183047;
    }

    .btn.primary {
      color: #04131d;
      border: 0;
      background: linear-gradient(135deg, var(--accent), #76d7ff);
    }

    .btn.danger {
      border-color: rgba(255,127,134,.45);
      color: #ffd9db;
      background: rgba(133,42,50,.24);
    }

    .btn:disabled {
      opacity: .52;
      cursor: not-allowed;
      transform: none;
    }

    .status-line {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: var(--muted);
      font-size: .9rem;
      white-space: nowrap;
    }

    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #62778a;
      box-shadow: 0 0 0 4px rgba(98,119,138,.10);
    }

    .dot.ok {
      background: var(--accent-2);
      box-shadow: 0 0 0 4px rgba(124,229,180,.12);
    }

    .dot.bad {
      background: var(--danger);
      box-shadow: 0 0 0 4px rgba(255,127,134,.12);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .stat {
      padding: 16px;
    }

    .stat .label {
      color: var(--muted);
      font-size: .82rem;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .stat .value {
      margin-top: 8px;
      font-size: 1.75rem;
      font-weight: 850;
      letter-spacing: -.04em;
    }

    .grid {
      display: grid;
      grid-template-columns: 360px minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }

    .compose {
      padding: 18px;
      position: sticky;
      top: 18px;
    }

    .section-title {
      margin: 0 0 4px;
      font-size: 1.05rem;
    }

    .section-copy {
      color: var(--muted);
      font-size: .86rem;
      margin: 0 0 18px;
    }

    .field {
      margin-bottom: 13px;
    }

    .field label {
      display: block;
      margin-bottom: 7px;
      color: #c8d6e2;
      font-size: .82rem;
      font-weight: 700;
    }

    .counter {
      float: right;
      color: var(--muted);
      font-weight: 500;
    }

    .filters {
      display: grid;
      grid-template-columns: minmax(170px, 1fr) minmax(160px, 220px) 120px auto;
      gap: 10px;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }

    .table-wrap {
      overflow: auto;
      max-height: 720px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 850px;
    }

    th, td {
      padding: 13px 14px;
      text-align: left;
      border-bottom: 1px solid rgba(36,54,74,.72);
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      background: #0f1c29;
      color: #9eb2c4;
      text-transform: uppercase;
      letter-spacing: .06em;
      font-size: .72rem;
      z-index: 1;
    }

    td {
      font-size: .86rem;
    }

    .message-cell {
      max-width: 310px;
      word-break: break-word;
    }

    .muted {
      color: var(--muted);
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .78rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 8px;
      border-radius: 999px;
      border: 1px solid #385066;
      background: #102131;
      font-weight: 800;
      font-size: .72rem;
      letter-spacing: .03em;
    }

    .badge.DELIVERED { color: #a7f0cc; border-color: rgba(124,229,180,.36); }
    .badge.SENT { color: #9cdcff; border-color: rgba(87,199,255,.4); }
    .badge.FAILED { color: #ffb5b9; border-color: rgba(255,127,134,.4); }
    .badge.AMBIGUOUS { color: #ffe2a3; border-color: rgba(248,202,117,.5); }
    .badge.CLAIMED { color: #d8c9ff; border-color: rgba(185,156,255,.4); }
    .badge.QUEUED { color: #d4e1ed; }

    .gateway-list {
      display: grid;
      gap: 8px;
      margin-top: 18px;
    }

    .gateway-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(7,16,25,.45);
    }

    .gateway-name {
      font-weight: 800;
      font-size: .88rem;
    }

    .gateway-meta {
      color: var(--muted);
      font-size: .75rem;
      margin-top: 3px;
    }

    .gateway-actions, .row-actions {
      display: flex;
      gap: 7px;
      align-items: center;
      flex-wrap: wrap;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 14px;
      border-top: 1px solid var(--line);
    }

    .timeline {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .timeline-item {
      border-left: 2px solid var(--accent);
      padding: 2px 0 2px 12px;
    }

    .timeline-kind {
      font-weight: 800;
      font-size: .86rem;
    }

    .audit-list {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }

    .audit-item {
      padding: 9px 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: rgba(7,16,25,.38);
      font-size: .78rem;
    }

    .toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      max-width: min(420px, calc(100vw - 48px));
      padding: 13px 15px;
      border: 1px solid #36526a;
      border-radius: 12px;
      background: #102131;
      box-shadow: var(--shadow);
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      transition: .18s;
      z-index: 30;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    .toast.error {
      border-color: rgba(255,127,134,.55);
    }

    dialog {
      width: min(520px, calc(100vw - 32px));
      color: var(--text);
      background: #0d1824;
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 0;
      box-shadow: 0 30px 100px rgba(0,0,0,.58);
    }

    dialog::backdrop {
      background: rgba(1,8,14,.75);
      backdrop-filter: blur(4px);
    }

    .dialog-body {
      padding: 20px;
    }

    .dialog-actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9px;
      margin-top: 16px;
    }

    .dialog-close {
      margin-top: 10px;
      width: 100%;
    }

    .empty {
      padding: 34px;
      text-align: center;
      color: var(--muted);
    }

    @media (max-width: 960px) {
      .grid { grid-template-columns: 1fr; }
      .compose { position: static; }
      .stats { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 620px) {
      .shell { width: min(100% - 18px, 1440px); padding-top: 14px; }
      header { align-items: flex-start; }
      .auth { grid-template-columns: 1fr; }
      .stats { grid-template-columns: 1fr 1fr; }
      .filters { grid-template-columns: 1fr; }
      .dialog-actions { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div class="brand">
        <div class="logo">SG</div>
        <div>
          <h1>SMS Gateway · Operador</h1>
          <div class="subtitle">Control local del gateway · backend <span class="version">v${safeVersion}</span></div>
        </div>
      </div>
      <div class="status-line">
        <span id="connectionDot" class="dot"></span>
        <span id="connectionText">Sin autenticar</span>
      </div>
    </header>

    <section class="panel auth">
      <input id="apiKey" class="input" type="password" autocomplete="off" placeholder="OPERATOR_API_KEY">
      <button id="connectBtn" class="btn primary">Conectar</button>
      <button id="forgetBtn" class="btn">Olvidar clave</button>
    </section>

    <section class="stats">
      <article class="panel stat">
        <div class="label">Gateways online</div>
        <div id="onlineCount" class="value">—</div>
      </article>
      <article class="panel stat">
        <div class="label">SMS totales</div>
        <div id="totalCount" class="value">—</div>
      </article>
      <article class="panel stat">
        <div class="label">Últimas 24 h</div>
        <div id="last24hCount" class="value">—</div>
      </article>
      <article class="panel stat">
        <div class="label">Tasa entrega</div>
        <div id="deliveryRate" class="value">—</div>
      </article>
      <article class="panel stat">
        <div class="label">Ambiguos</div>
        <div id="ambiguousCount" class="value">—</div>
      </article>
    </section>

    <section class="grid">
      <aside class="panel compose">
        <h2 class="section-title">Nuevo SMS</h2>
        <p class="section-copy">Crea un trabajo idempotente y lo entrega al gateway seleccionado.</p>

        <form id="sendForm">
          <div class="field">
            <label for="gatewaySelect">Gateway</label>
            <select id="gatewaySelect" required>
              <option value="">Conecta el panel primero</option>
            </select>
          </div>

          <div class="field">
            <label for="destination">Destino</label>
            <input id="destination" class="input" type="tel" placeholder="+51924667910" required>
          </div>

          <div class="field">
            <label for="message">Mensaje <span id="charCount" class="counter">0/160</span></label>
            <textarea id="message" maxlength="160" placeholder="Escribe el SMS…" required></textarea>
          </div>

          <button id="sendBtn" class="btn primary" type="submit" style="width:100%">Enviar SMS</button>
        </form>

        <div id="gatewayCards" class="gateway-list"></div>
        <h3 class="section-title" style="margin-top:20px">Auditoría reciente</h3>
        <div id="auditList" class="audit-list"></div>
      </aside>

      <section class="panel">
        <div class="filters">
          <select id="gatewayFilter">
            <option value="">Todos los gateways</option>
          </select>

          <select id="statusFilter">
            <option value="">Todos los estados</option>
            <option>QUEUED</option>
            <option>CLAIMED</option>
            <option>SENT</option>
            <option>DELIVERED</option>
            <option>FAILED</option>
            <option>AMBIGUOUS</option>
          </select>

          <select id="perPageSelect">
            <option value="10">10 / pág.</option>
            <option value="25" selected>25 / pág.</option>
            <option value="50">50 / pág.</option>
            <option value="100">100 / pág.</option>
          </select>

          <button id="refreshBtn" class="btn">Actualizar</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Destino / mensaje</th>
                <th>Gateway</th>
                <th>Intentos</th>
                <th>Creado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody id="messageRows">
              <tr><td colspan="6" class="empty">Introduce la API key del operador.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button id="prevPageBtn" class="btn">Anterior</button>
          <span id="pageLabel" class="muted">Página —</span>
          <button id="nextPageBtn" class="btn">Siguiente</button>
        </div>
      </section>
    </section>
  </main>

  <dialog id="resolveDialog">
    <div class="dialog-body">
      <h2 class="section-title">Resolver estado ambiguo</h2>
      <p id="resolveJobLabel" class="section-copy"></p>
      <div class="field">
        <label for="resolutionNote">Nota obligatoria de auditoría</label>
        <textarea id="resolutionNote" maxlength="500" placeholder="Ej.: confirmado manualmente con el destinatario" required></textarea>
      </div>
      <div class="dialog-actions">
        <button class="btn" data-resolution="SENT">Marcar SENT</button>
        <button class="btn primary" data-resolution="DELIVERED">Marcar DELIVERED</button>
        <button class="btn danger" data-resolution="FAILED">Marcar FAILED</button>
      </div>
      <button id="closeResolveBtn" class="btn dialog-close">Cancelar</button>
    </div>
  </dialog>

  <dialog id="detailDialog">
    <div class="dialog-body">
      <h2 class="section-title">Detalle del SMS</h2>
      <div id="detailContent"></div>
      <button id="closeDetailBtn" class="btn dialog-close">Cerrar</button>
    </div>
  </dialog>

  <div id="toast" class="toast"></div>

  <script>
    (function () {
      "use strict";

      var state = {
        key: sessionStorage.getItem("smsGatewayOperatorKey") || "",
        gateways: [],
        messages: [],
        metrics: null,
        audit: [],
        page: 1,
        pagination: {
          page: 1,
          perPage: 25,
          total: 0,
          totalPages: 1
        },
        resolvingJobId: null,
        timer: null
      };

      var $ = function (id) { return document.getElementById(id); };

      function authHeaders() {
        return {
          "Authorization": "Bearer " + state.key,
          "Content-Type": "application/json"
        };
      }

      async function api(path, options) {
        var response = await fetch(path, Object.assign({}, options || {}, {
          headers: Object.assign({}, authHeaders(), (options && options.headers) || {})
        }));

        var body = null;
        var text = await response.text();

        if (text) {
          try { body = JSON.parse(text); }
          catch (_) { body = { raw: text }; }
        }

        if (!response.ok) {
          var error = new Error(
            body && body.error
              ? body.error
              : "HTTP " + response.status
          );
          error.status = response.status;
          error.body = body;
          throw error;
        }

        return body;
      }

      function toast(message, isError) {
        var el = $("toast");
        el.textContent = message;
        el.classList.toggle("error", Boolean(isError));
        el.classList.add("show");
        window.clearTimeout(el._timer);
        el._timer = window.setTimeout(function () {
          el.classList.remove("show");
        }, 3200);
      }

      function setConnection(ok, text) {
        $("connectionDot").className = "dot" + (ok === true ? " ok" : ok === false ? " bad" : "");
        $("connectionText").textContent = text;
      }

      function fmt(value) {
        if (!value) return "—";
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat("es-PE", {
          dateStyle: "short",
          timeStyle: "medium"
        }).format(date);
      }

      function escapeText(value) {
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
      }

      function renderGateways() {
        var select = $("gatewaySelect");
        var filter = $("gatewayFilter");
        var currentSend = select.value;
        var currentFilter = filter.value;

        select.innerHTML = "";
        filter.innerHTML = '<option value="">Todos los gateways</option>';

        state.gateways.forEach(function (g) {
          if (g.enabled) {
            var option = document.createElement("option");
            option.value = g.gatewayId;
            option.textContent =
              g.gatewayId + (g.online ? " · online" : " · offline");
            select.appendChild(option);
          }

          var filterOption = document.createElement("option");
          filterOption.value = g.gatewayId;
          filterOption.textContent = g.gatewayId;
          filter.appendChild(filterOption);
        });

        if (
          currentSend &&
          state.gateways.some(function (g) {
            return g.gatewayId === currentSend && g.enabled;
          })
        ) {
          select.value = currentSend;
        }

        if (
          currentFilter &&
          state.gateways.some(function (g) {
            return g.gatewayId === currentFilter;
          })
        ) {
          filter.value = currentFilter;
        }

        var cards = $("gatewayCards");
        cards.innerHTML = state.gateways.map(function (g) {
          var stateLabel = !g.enabled
            ? "Deshabilitado"
            : g.online
              ? "Online"
              : "Offline";

          var buttonLabel = g.enabled
            ? "Deshabilitar"
            : "Habilitar";

          return '<div class="gateway-item">' +
            '<div><div class="gateway-name">' + escapeText(g.gatewayId) + '</div>' +
            '<div class="gateway-meta">' + escapeText(g.deviceModel) + ' · Android ' +
              escapeText(g.androidVersion) + ' · app ' + escapeText(g.appVersion) + '</div>' +
            '<div class="gateway-meta">Último heartbeat: ' + escapeText(fmt(g.lastSeenAt)) + '</div>' +
            (g.tokenRotatedAt
              ? '<div class="gateway-meta">Token rotado: ' + escapeText(fmt(g.tokenRotatedAt)) + '</div>'
              : '') +
            (g.tokenRotationPendingUntil
              ? '<div class="gateway-meta" style="color:#ffe2a3">Rotación pendiente hasta ' +
                  escapeText(fmt(g.tokenRotationPendingUntil)) + '</div>'
              : '') +
            '</div>' +
            '<div class="gateway-actions">' +
              '<span class="status-line"><span class="dot ' +
                (g.online ? 'ok' : 'bad') + '"></span>' + stateLabel + '</span>' +
              (g.enabled && g.online
                ? '<button class="btn gateway-rotate-token" data-gateway-id="' +
                    escapeText(g.gatewayId) + '">Rotar token</button>'
                : '') +
              '<button class="btn gateway-toggle" data-gateway-id="' +
                escapeText(g.gatewayId) + '" data-enabled="' +
                String(g.enabled) + '">' + buttonLabel + '</button>' +
            '</div>' +
          '</div>';
        }).join("");

        document.querySelectorAll(".gateway-toggle").forEach(function (button) {
          button.addEventListener("click", function () {
            toggleGateway(
              button.getAttribute("data-gateway-id"),
              button.getAttribute("data-enabled") === "true"
            );
          });
        });

        document.querySelectorAll(".gateway-rotate-token").forEach(function (button) {
          button.addEventListener("click", function () {
            rotateGatewayToken(
              button.getAttribute("data-gateway-id")
            );
          });
        });

        $("onlineCount").textContent = String(
          state.gateways.filter(function (g) { return g.online; }).length
        );
      }

      function renderMetrics() {
        var metrics = state.metrics;

        if (!metrics) {
          $("totalCount").textContent = "—";
          $("last24hCount").textContent = "—";
          $("deliveryRate").textContent = "—";
          $("ambiguousCount").textContent = "—";
          return;
        }

        $("totalCount").textContent = String(metrics.total);
        $("last24hCount").textContent = String(metrics.last24h);
        $("deliveryRate").textContent =
          metrics.deliveryRate == null
            ? "—"
            : String(metrics.deliveryRate) + "%";
        $("ambiguousCount").textContent =
          String(metrics.counts.AMBIGUOUS || 0);
      }

      function renderAudit() {
        var container = $("auditList");

        if (!state.audit.length) {
          container.innerHTML =
            '<div class="muted">Sin acciones administrativas recientes.</div>';
          return;
        }

        container.innerHTML = state.audit.slice(0, 8).map(function (entry) {
          return '<div class="audit-item">' +
            '<strong>' + escapeText(entry.action) + '</strong>' +
            '<div class="muted">' + escapeText(entry.targetId) +
              ' · ' + escapeText(fmt(entry.createdAt)) + '</div>' +
            (entry.note
              ? '<div style="margin-top:4px">' + escapeText(entry.note) + '</div>'
              : '') +
          '</div>';
        }).join("");
      }

      function renderPagination() {
        var p = state.pagination;
        $("pageLabel").textContent =
          "Página " + p.page + " de " + p.totalPages +
          " · " + p.total + " registros";
        $("prevPageBtn").disabled = p.page <= 1;
        $("nextPageBtn").disabled = p.page >= p.totalPages;
      }

      function renderMessages() {
        var tbody = $("messageRows");

        if (!state.messages.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay mensajes para esos filtros.</td></tr>';
          renderPagination();
          return;
        }

        tbody.innerHTML = state.messages.map(function (m) {
          var actions =
            '<div class="row-actions">' +
              '<button class="btn detail-btn" data-job-id="' +
                escapeText(m.id) + '">Detalle</button>' +
              (m.status === "AMBIGUOUS"
                ? '<button class="btn resolve-btn" data-job-id="' +
                    escapeText(m.id) + '">Resolver</button>'
                : '') +
            '</div>';

          var audit = m.operatorResolvedAt
            ? '<div class="muted" style="margin-top:5px">Resuelto manualmente · ' +
                escapeText(fmt(m.operatorResolvedAt)) + '</div>'
            : '';

          var error = m.lastError
            ? '<div style="color:#ffb5b9;margin-top:5px">' +
                escapeText(m.lastError) + '</div>'
            : '';

          return '<tr>' +
            '<td><span class="badge ' + escapeText(m.status) + '">' +
              escapeText(m.status) + '</span>' + audit + '</td>' +
            '<td class="message-cell"><strong>' + escapeText(m.destination) + '</strong>' +
              '<div style="margin-top:5px">' + escapeText(m.message) + '</div>' +
              error + '</td>' +
            '<td><div class="mono">' + escapeText(m.gatewayId) + '</div>' +
              '<div class="muted mono" style="margin-top:5px">' +
                escapeText(m.id.slice(0, 18)) + '…</div></td>' +
            '<td>' + escapeText(m.attempts) + '</td>' +
            '<td>' + escapeText(fmt(m.createdAt)) + '</td>' +
            '<td>' + actions + '</td>' +
          '</tr>';
        }).join("");

        document.querySelectorAll(".resolve-btn").forEach(function (button) {
          button.addEventListener("click", function () {
            openResolve(button.getAttribute("data-job-id"));
          });
        });

        document.querySelectorAll(".detail-btn").forEach(function (button) {
          button.addEventListener("click", function () {
            openDetail(button.getAttribute("data-job-id"));
          });
        });

        renderPagination();
      }

      async function refresh() {
        if (!state.key) {
          setConnection(null, "Sin autenticar");
          return;
        }

        var gatewayFilter = $("gatewayFilter").value;
        var statusFilter = $("statusFilter").value;
        var perPage = Number($("perPageSelect").value || 25);

        var params = new URLSearchParams();
        params.set("page", String(state.page));
        params.set("perPage", String(perPage));
        if (gatewayFilter) params.set("gatewayId", gatewayFilter);
        if (statusFilter) params.set("status", statusFilter);

        var metricsParams = new URLSearchParams();
        if (gatewayFilter) metricsParams.set("gatewayId", gatewayFilter);

        try {
          var results = await Promise.all([
            api("/api/v1/gateways"),
            api("/api/v1/messages?" + params.toString()),
            api("/api/v1/metrics?" + metricsParams.toString()),
            api("/api/v1/audit?limit=20")
          ]);

          state.gateways = results[0].gateways || [];
          state.messages = results[1].messages || [];
          state.pagination = results[1].pagination || state.pagination;
          state.page = state.pagination.page;
          state.metrics = results[2];
          state.audit = results[3].logs || [];

          renderGateways();
          renderMessages();
          renderMetrics();
          renderAudit();
          setConnection(true, "Autenticado · actualización automática");
        } catch (error) {
          if (error.status === 401) {
            setConnection(false, "API key inválida");
          } else {
            setConnection(false, "Backend no disponible");
          }
          toast(error.message, true);
        }
      }

      async function toggleGateway(gatewayId, currentlyEnabled) {
        var nextEnabled = !currentlyEnabled;
        var action = nextEnabled ? "habilitar" : "deshabilitar";
        var note = window.prompt(
          "Motivo para " + action + " " + gatewayId + ":"
        );

        if (note == null) return;
        note = note.trim();

        if (note.length < 3) {
          toast("La nota debe tener al menos 3 caracteres.", true);
          return;
        }

        if (!window.confirm(
          "¿Confirmas " + action + " el gateway " + gatewayId + "?"
        )) {
          return;
        }

        try {
          await api(
            "/api/v1/gateways/" + encodeURIComponent(gatewayId),
            {
              method: "PATCH",
              body: JSON.stringify({
                enabled: nextEnabled,
                note: note
              })
            }
          );

          toast(
            "Gateway " + gatewayId + " " +
            (nextEnabled ? "habilitado." : "deshabilitado.")
          );
          await refresh();
        } catch (error) {
          toast("No se pudo actualizar el gateway: " + error.message, true);
        }
      }

      async function rotateGatewayToken(gatewayId) {
        var note = window.prompt(
          "Motivo para rotar la credencial de " + gatewayId + ":"
        );

        if (note == null) return;
        note = note.trim();

        if (note.length < 3) {
          toast("La nota debe tener al menos 3 caracteres.", true);
          return;
        }

        if (!window.confirm(
          "¿Confirmas rotar el token de " + gatewayId +
          "? El A03 recibirá la credencial nueva por su socket autenticado y reconectará automáticamente."
        )) {
          return;
        }

        try {
          var result = await api(
            "/api/v1/gateways/" +
              encodeURIComponent(gatewayId) +
              "/rotate-token",
            {
              method: "POST",
              body: JSON.stringify({
                note: note
              })
            }
          );

          toast(
            "Rotación enviada. Esperando confirmación del gateway hasta " +
            fmt(result.expiresAt) + "."
          );

          window.setTimeout(refresh, 1500);
        } catch (error) {
          toast(
            "No se pudo iniciar la rotación: " + error.message,
            true
          );
        }
      }

      async function openDetail(jobId) {
        try {
          var detail = await api(
            "/api/v1/messages/" + encodeURIComponent(jobId) + "/detail"
          );

          var m = detail.message;
          var timeline = detail.timeline || [];

          $("detailContent").innerHTML =
            '<div class="mono" style="margin:10px 0">' +
              escapeText(m.id) + '</div>' +
            '<div><strong>' + escapeText(m.destination) + '</strong></div>' +
            '<div style="margin-top:6px">' + escapeText(m.message) + '</div>' +
            '<div class="muted" style="margin-top:8px">Gateway ' +
              escapeText(m.gatewayId) + ' · intentos ' +
              escapeText(m.attempts) + '</div>' +
            '<div class="timeline">' +
              timeline.map(function (event) {
                return '<div class="timeline-item">' +
                  '<div class="timeline-kind">' + escapeText(event.kind) + '</div>' +
                  '<div class="muted">' + escapeText(fmt(event.at)) + '</div>' +
                  (event.note
                    ? '<div style="margin-top:3px">' + escapeText(event.note) + '</div>'
                    : '') +
                '</div>';
              }).join("") +
            '</div>';

          $("detailDialog").showModal();
        } catch (error) {
          toast("No se pudo cargar el detalle: " + error.message, true);
        }
      }

      async function sendSms(event) {
        event.preventDefault();

        var gatewayId = $("gatewaySelect").value;
        var destination = $("destination").value.trim();
        var message = $("message").value;

        if (!gatewayId || !destination || !message) {
          toast("Completa gateway, destino y mensaje.", true);
          return;
        }

        var button = $("sendBtn");
        button.disabled = true;
        button.textContent = "Encolando…";

        try {
          var idempotencyKey = "operator-" + crypto.randomUUID();
          var result = await api("/api/v1/messages", {
            method: "POST",
            body: JSON.stringify({
              idempotencyKey: idempotencyKey,
              gatewayId: gatewayId,
              destination: destination,
              message: message
            })
          });

          toast(result.created ? "SMS encolado correctamente." : "La solicitud ya existía.");
          $("message").value = "";
          $("charCount").textContent = "0/160";
          await refresh();
        } catch (error) {
          toast("No se pudo crear el SMS: " + error.message, true);
        } finally {
          button.disabled = false;
          button.textContent = "Enviar SMS";
        }
      }

      function openResolve(jobId) {
        state.resolvingJobId = jobId;
        $("resolutionNote").value = "";
        $("resolveJobLabel").textContent =
          "Job " + jobId + ". Esta acción registra una decisión humana; no reenvía el SMS.";
        $("resolveDialog").showModal();
      }

      async function resolve(status) {
        var note = $("resolutionNote").value.trim();

        if (!note) {
          toast("Escribe una nota de auditoría antes de resolver.", true);
          return;
        }

        var label =
          status === "DELIVERED" ? "entregado" :
          status === "SENT" ? "enviado" : "fallido";

        if (!window.confirm(
          "¿Confirmas marcar este job como " + label + "? No se enviará ningún SMS adicional."
        )) {
          return;
        }

        try {
          await api(
            "/api/v1/messages/" + encodeURIComponent(state.resolvingJobId) + "/resolve",
            {
              method: "POST",
              body: JSON.stringify({
                status: status,
                note: note
              })
            }
          );

          $("resolveDialog").close();
          toast("Estado ambiguo resuelto como " + status + ".");
          await refresh();
        } catch (error) {
          toast("No se pudo resolver: " + error.message, true);
        }
      }

      $("connectBtn").addEventListener("click", function () {
        state.key = $("apiKey").value.trim();

        if (!state.key) {
          toast("Introduce la API key del operador.", true);
          return;
        }

        sessionStorage.setItem("smsGatewayOperatorKey", state.key);
        state.page = 1;
        refresh();
      });

      $("forgetBtn").addEventListener("click", function () {
        sessionStorage.removeItem("smsGatewayOperatorKey");
        state.key = "";
        $("apiKey").value = "";
        state.gateways = [];
        state.messages = [];
        state.metrics = null;
        state.audit = [];
        state.page = 1;
        state.pagination = {
          page: 1,
          perPage: 25,
          total: 0,
          totalPages: 1
        };
        renderGateways();
        renderMessages();
        renderMetrics();
        renderAudit();
        setConnection(null, "Sin autenticar");
      });

      $("refreshBtn").addEventListener("click", refresh);

      $("gatewayFilter").addEventListener("change", function () {
        state.page = 1;
        refresh();
      });

      $("statusFilter").addEventListener("change", function () {
        state.page = 1;
        refresh();
      });

      $("perPageSelect").addEventListener("change", function () {
        state.page = 1;
        refresh();
      });

      $("prevPageBtn").addEventListener("click", function () {
        if (state.pagination.page > 1) {
          state.page = state.pagination.page - 1;
          refresh();
        }
      });

      $("nextPageBtn").addEventListener("click", function () {
        if (state.pagination.page < state.pagination.totalPages) {
          state.page = state.pagination.page + 1;
          refresh();
        }
      });

      $("sendForm").addEventListener("submit", sendSms);

      $("message").addEventListener("input", function () {
        $("charCount").textContent = String($("message").value.length) + "/160";
      });

      $("closeResolveBtn").addEventListener("click", function () {
        $("resolveDialog").close();
      });

      $("closeDetailBtn").addEventListener("click", function () {
        $("detailDialog").close();
      });

      document.querySelectorAll("[data-resolution]").forEach(function (button) {
        button.addEventListener("click", function () {
          resolve(button.getAttribute("data-resolution"));
        });
      });

      if (state.key) {
        $("apiKey").value = state.key;
        refresh();
      } else {
        renderGateways();
        renderMessages();
        renderMetrics();
        renderAudit();
      }

      state.timer = window.setInterval(function () {
        if (
          state.key &&
          !$("resolveDialog").open &&
          !$("detailDialog").open
        ) {
          refresh();
        }
      }, 5000);
    })();
  </script>
</body>
</html>`;
}
