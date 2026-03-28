// Social Sentinel Dashboard — single-page control terminal
// Served at /dashboard, authenticated via Bearer token

export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Social Sentinel — Command Center</title>
  <meta name="description" content="Privacy-first social media management hub. Compose, schedule, and monitor your social presence.">
  <meta name="theme-color" content="#04040a">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #04040a;
      --bg-card: #080812;
      --bg-input: #0c0c18;
      --border: rgba(123, 123, 223, 0.08);
      --border-bright: rgba(123, 123, 223, 0.18);
      --border-focus: rgba(123, 123, 223, 0.4);
      --accent: #7b7bdf;
      --accent-glow: #8b8bff;
      --teal: #3dd6c8;
      --green: #2dd4a0;
      --amber: #f5a623;
      --red: #ef4444;
      --text: #c8c8d8;
      --text-dim: #5a5a70;
      --text-muted: #2e2e3e;
      --mono: 'JetBrains Mono', monospace;
      --display: 'Syne', sans-serif;
    }

    html { -webkit-font-smoothing: antialiased; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.6;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Noise overlay */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      opacity: 0.02;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-size: 256px 256px;
      pointer-events: none;
      z-index: 1;
    }

    .ambient {
      position: fixed;
      top: -40%;
      left: 50%;
      transform: translateX(-50%);
      width: 140%;
      height: 70%;
      background: radial-gradient(ellipse at center, rgba(123,123,223,0.04) 0%, transparent 65%);
      pointer-events: none;
      z-index: 0;
      animation: breathe 10s ease-in-out infinite;
    }

    @keyframes breathe {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .scan {
      position: fixed;
      left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent 5%, rgba(123,123,223,0.06) 50%, transparent 95%);
      pointer-events: none;
      z-index: 50;
      animation: scan-move 6s linear infinite;
    }

    @keyframes scan-move {
      0% { top: -1px; }
      100% { top: 100vh; }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideDown {
      from { opacity: 0; max-height: 0; }
      to { opacity: 1; max-height: 200px; }
    }

    /* ── Auth Gate ───────────────────────── */
    .auth-gate {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    }

    .auth-gate.hidden { display: none; }

    .auth-box {
      background: var(--bg-card);
      border: 1px solid var(--border-bright);
      border-radius: 12px;
      padding: 2.5rem;
      width: 380px;
      max-width: 90vw;
      text-align: center;
    }

    .auth-box h2 {
      font-family: var(--display);
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 0.25rem;
    }

    .auth-box p {
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 1.5rem;
    }

    .auth-box input {
      width: 100%;
      padding: 0.7rem 1rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 12px;
      outline: none;
      margin-bottom: 1rem;
      transition: border-color 0.2s;
    }

    .auth-box input:focus { border-color: var(--border-focus); }

    .auth-box button {
      width: 100%;
      padding: 0.65rem;
      background: rgba(123,123,223,0.12);
      border: 1px solid var(--border-bright);
      border-radius: 6px;
      color: var(--accent-glow);
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .auth-box button:hover {
      background: rgba(123,123,223,0.2);
      border-color: var(--accent);
    }

    .auth-error {
      color: var(--red);
      font-size: 11px;
      margin-top: 0.5rem;
      display: none;
    }

    /* ── Layout ──────────────────────────── */
    .wrap {
      position: relative;
      z-index: 2;
      max-width: 1100px;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 4rem;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.5rem;
      animation: fadeIn 0.4s ease;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }

    .logo-mark {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(61,214,200,0.15), rgba(123,123,223,0.1));
      border: 1px solid var(--border-bright);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .header-title h1 {
      font-family: var(--display);
      font-size: 18px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
    }

    .header-title span {
      font-size: 10px;
      color: var(--text-dim);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .version-tag {
      font-size: 10px;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      background: rgba(123,123,223,0.08);
      border: 1px solid var(--border);
      color: var(--accent);
      font-weight: 500;
    }

    .platform-badge {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 10px;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .platform-badge.connected {
      background: rgba(45, 212, 160, 0.08);
      border: 1px solid rgba(45, 212, 160, 0.2);
      color: var(--green);
    }

    .platform-badge.pending {
      background: rgba(90, 90, 112, 0.08);
      border: 1px solid var(--border);
      color: var(--text-dim);
    }

    .badge-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }

    .connected .badge-dot {
      background: var(--green);
      box-shadow: 0 0 6px rgba(45,212,160,0.5);
      animation: pulse 2s ease-in-out infinite;
    }

    .pending .badge-dot { background: var(--text-muted); }

    /* ── Grid ────────────────────────────── */
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }

    .grid .full-width { grid-column: 1 / -1; }

    /* ── Card ────────────────────────────── */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      animation: fadeIn 0.5s ease both;
    }

    .card:nth-child(2) { animation-delay: 0.05s; }
    .card:nth-child(3) { animation-delay: 0.1s; }
    .card:nth-child(4) { animation-delay: 0.15s; }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1.1rem;
      border-bottom: 1px solid var(--border);
    }

    .card-label {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 500;
    }

    .card-body { padding: 1.1rem; }

    /* ── Compose ─────────────────────────── */
    .compose-area {
      width: 100%;
      min-height: 100px;
      max-height: 200px;
      resize: vertical;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      color: var(--text);
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.6;
      outline: none;
      transition: border-color 0.2s;
    }

    .compose-area:focus { border-color: var(--border-focus); }

    .compose-area::placeholder { color: var(--text-muted); }

    .compose-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 0.6rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .char-counter {
      font-size: 11px;
      color: var(--text-dim);
      transition: color 0.2s;
    }

    .char-counter.warn { color: var(--amber); }
    .char-counter.over { color: var(--red); font-weight: 600; }

    .pii-warning {
      display: none;
      align-items: center;
      gap: 0.35rem;
      font-size: 10px;
      color: var(--amber);
      padding: 0.15rem 0.5rem;
      background: rgba(245, 166, 35, 0.08);
      border: 1px solid rgba(245, 166, 35, 0.2);
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .pii-warning.visible { display: flex; }

    .compose-options {
      margin-top: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .option-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .option-row label {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      min-width: 70px;
    }

    .option-row input, .option-row select {
      flex: 1;
      padding: 0.45rem 0.65rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 11px;
      outline: none;
      transition: border-color 0.2s;
    }

    .option-row input:focus, .option-row select:focus { border-color: var(--border-focus); }

    .option-row select { cursor: pointer; }
    .option-row select option { background: var(--bg-card); }

    .schedule-row {
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.3s ease, opacity 0.2s ease, margin 0.2s ease;
    }

    .schedule-row.visible {
      max-height: 60px;
      opacity: 1;
    }

    input[type="datetime-local"] {
      color-scheme: dark;
    }

    .compose-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.85rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid;
      letter-spacing: 0.02em;
    }

    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-primary {
      background: rgba(61, 214, 200, 0.1);
      border-color: rgba(61, 214, 200, 0.25);
      color: var(--teal);
    }

    .btn-primary:hover:not(:disabled) {
      background: rgba(61, 214, 200, 0.18);
      border-color: var(--teal);
    }

    .btn-secondary {
      background: rgba(123,123,223,0.08);
      border-color: var(--border-bright);
      color: var(--accent);
    }

    .btn-secondary:hover:not(:disabled) {
      background: rgba(123,123,223,0.15);
      border-color: var(--accent);
    }

    .btn-secondary.active {
      background: rgba(123,123,223,0.18);
      border-color: var(--accent);
      box-shadow: 0 0 8px rgba(123,123,223,0.15);
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.06);
      border-color: rgba(239, 68, 68, 0.2);
      color: var(--red);
      font-size: 10px;
      padding: 0.3rem 0.6rem;
    }

    .btn-danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.12);
      border-color: var(--red);
    }

    .compose-feedback {
      margin-top: 0.6rem;
      font-size: 11px;
      padding: 0.5rem 0.75rem;
      border-radius: 5px;
      display: none;
    }

    .compose-feedback.success {
      display: block;
      background: rgba(45, 212, 160, 0.06);
      border: 1px solid rgba(45, 212, 160, 0.2);
      color: var(--green);
    }

    .compose-feedback.error {
      display: block;
      background: rgba(239, 68, 68, 0.06);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--red);
    }

    /* ── Tables ──────────────────────────── */
    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: left;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--border);
      font-weight: 400;
    }

    tbody td {
      padding: 0.55rem 0.75rem;
      font-size: 11px;
      border-bottom: 1px solid rgba(255,255,255,0.015);
      vertical-align: middle;
    }

    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: rgba(123,123,223,0.02); }

    .status-badge {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-draft { background: rgba(90,90,112,0.15); color: var(--text-dim); }
    .status-scheduled { background: rgba(61,214,200,0.1); color: var(--teal); }
    .status-publishing { background: rgba(245,166,35,0.1); color: var(--amber); }
    .status-published { background: rgba(45,212,160,0.1); color: var(--green); }
    .status-failed { background: rgba(239,68,68,0.1); color: var(--red); }
    .status-success { background: rgba(45,212,160,0.1); color: var(--green); }
    .status-cancelled { background: rgba(90,90,112,0.15); color: var(--text-dim); }

    .text-preview {
      color: var(--text);
      max-width: 280px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .text-dim { color: var(--text-dim); }
    .text-link {
      color: var(--accent);
      text-decoration: none;
      transition: color 0.2s;
    }
    .text-link:hover { color: var(--accent-glow); }

    .empty-state {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--text-muted);
      font-size: 11px;
      font-style: italic;
    }

    /* ── Feed ────────────────────────────── */
    .feed-item {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }

    .feed-item:last-child { border-bottom: none; }

    .feed-text {
      font-size: 12px;
      color: var(--text);
      line-height: 1.5;
      margin-bottom: 0.4rem;
      word-break: break-word;
    }

    .feed-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 10px;
      color: var(--text-dim);
    }

    .feed-stat {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .feed-stat .count { color: var(--text); font-weight: 500; }

    /* ── Loading ─────────────────────────── */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      color: var(--text-dim);
      font-size: 11px;
      gap: 0.5rem;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Footer ──────────────────────────── */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 1.5rem;
      margin-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-size: 10px;
      color: var(--text-muted);
      animation: fadeIn 0.6s ease both;
      animation-delay: 0.2s;
    }

    .footer a {
      color: var(--text-dim);
      text-decoration: none;
      transition: color 0.2s;
    }

    .footer a:hover { color: var(--accent); }

    /* ── Responsive ──────────────────────── */
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
      .grid .full-width { grid-column: 1; }
      .header { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
      .header-right { flex-wrap: wrap; }
      .compose-actions { flex-direction: column; }
      .btn { width: 100%; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="ambient"></div>
  <div class="scan"></div>

  <!-- Auth Gate -->
  <div class="auth-gate" id="authGate">
    <div class="auth-box">
      <h2>Social Sentinel</h2>
      <p>Enter your API key to access the command center</p>
      <input type="password" id="authKey" placeholder="ss_..." autocomplete="off" spellcheck="false">
      <button onclick="authenticate()">Authenticate</button>
      <div class="auth-error" id="authError">Authentication failed</div>
    </div>
  </div>

  <!-- Dashboard -->
  <div class="wrap" id="dashboard" style="display:none">
    <header class="header">
      <div class="header-left">
        <div class="logo-mark">&#9401;</div>
        <div class="header-title">
          <h1>Social Sentinel</h1>
          <span>Command Center</span>
        </div>
      </div>
      <div class="header-right">
        <div class="platform-badge connected">
          <span class="badge-dot"></span>
          Bluesky
        </div>
        <div class="platform-badge pending">
          <span class="badge-dot"></span>
          Twitter
        </div>
        <div class="platform-badge pending">
          <span class="badge-dot"></span>
          Facebook
        </div>
        <span class="version-tag">v2.0.0</span>
      </div>
    </header>

    <div class="grid">
      <!-- Compose -->
      <div class="card full-width">
        <div class="card-header">
          <span class="card-label">Compose</span>
          <div class="pii-warning" id="piiWarning">
            <span>&#9888;</span> PII Detected
          </div>
        </div>
        <div class="card-body">
          <textarea class="compose-area" id="composeText" placeholder="What's on your mind?" maxlength="300" oninput="updateCompose()"></textarea>
          <div class="compose-meta">
            <span class="char-counter" id="charCounter">0 / 300</span>
          </div>
          <div class="compose-options">
            <div class="option-row">
              <label>Platform</label>
              <select id="composePlatform">
                <option value="bluesky">Bluesky</option>
                <option value="twitter" disabled>Twitter (soon)</option>
                <option value="facebook" disabled>Facebook (soon)</option>
              </select>
            </div>
            <div class="option-row">
              <label>Image</label>
              <input type="url" id="composeImage" placeholder="https://... (optional)">
            </div>
            <div class="schedule-row" id="scheduleRow">
              <div class="option-row">
                <label>When</label>
                <input type="datetime-local" id="scheduleTime">
              </div>
            </div>
          </div>
          <div class="compose-actions">
            <button class="btn btn-primary" id="btnPost" onclick="postNow()">Post Now</button>
            <button class="btn btn-secondary" id="btnSchedule" onclick="toggleSchedule()">Schedule</button>
          </div>
          <div class="compose-feedback" id="composeFeedback"></div>
        </div>
      </div>

      <!-- Queue -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Queue</span>
          <span class="card-label" id="queueCount"></span>
        </div>
        <div class="card-body" id="queueBody">
          <div class="loading"><div class="spinner"></div> Loading queue...</div>
        </div>
      </div>

      <!-- History -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Publish History</span>
        </div>
        <div class="card-body" id="historyBody">
          <div class="loading"><div class="spinner"></div> Loading history...</div>
        </div>
      </div>

      <!-- Feed -->
      <div class="card full-width">
        <div class="card-header">
          <span class="card-label">Bluesky Feed</span>
          <button class="btn btn-secondary" style="font-size:10px;padding:0.2rem 0.5rem" onclick="loadFeed()">Refresh</button>
        </div>
        <div class="card-body" id="feedBody">
          <div class="loading"><div class="spinner"></div> Loading feed...</div>
        </div>
      </div>
    </div>

    <footer class="footer">
      <span>Social Sentinel v2.0.0 &middot; privacy-first &middot; ${new Date().getFullYear()}</span>
      <a href="/health">API Health</a>
    </footer>
  </div>

  <script>
    // ─── State ──────────────────────────────
    let TOKEN = sessionStorage.getItem('ss_token') || '';
    let scheduleMode = false;
    let refreshInterval = null;

    // ─── Auth ───────────────────────────────
    async function authenticate() {
      const key = document.getElementById('authKey').value.trim();
      if (!key) return;

      try {
        const res = await fetch('/drafts', { headers: { 'Authorization': 'Bearer ' + key } });
        if (res.ok) {
          TOKEN = key;
          sessionStorage.setItem('ss_token', key);
          document.getElementById('authGate').classList.add('hidden');
          document.getElementById('dashboard').style.display = 'block';
          boot();
        } else {
          document.getElementById('authError').style.display = 'block';
        }
      } catch {
        document.getElementById('authError').style.display = 'block';
      }
    }

    document.getElementById('authKey').addEventListener('keydown', e => {
      if (e.key === 'Enter') authenticate();
    });

    // Auto-login if token exists
    if (TOKEN) {
      fetch('/drafts', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
        .then(r => {
          if (r.ok) {
            document.getElementById('authGate').classList.add('hidden');
            document.getElementById('dashboard').style.display = 'block';
            boot();
          } else {
            sessionStorage.removeItem('ss_token');
            TOKEN = '';
          }
        }).catch(() => {});
    }

    // ─── API Helper ─────────────────────────
    async function api(path, opts = {}) {
      const res = await fetch(path, {
        ...opts,
        headers: {
          'Authorization': 'Bearer ' + TOKEN,
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
      });
      return res.json();
    }

    // ─── Boot ───────────────────────────────
    function boot() {
      loadQueue();
      loadHistory();
      loadFeed();
      refreshInterval = setInterval(loadQueue, 30000);
    }

    // ─── Compose ────────────────────────────
    const PII_PATTERNS = [
      /\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b/,  // email
      /\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b/,                        // phone
      /\\b\\d{3}-\\d{2}-\\d{4}\\b/,                                 // SSN
      /\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b/,            // credit card
    ];

    function updateCompose() {
      const text = document.getElementById('composeText').value;
      const len = text.length;
      const counter = document.getElementById('charCounter');
      counter.textContent = len + ' / 300';
      counter.className = 'char-counter' + (len > 280 ? ' warn' : '') + (len > 300 ? ' over' : '');

      const hasPII = PII_PATTERNS.some(p => p.test(text));
      document.getElementById('piiWarning').className = 'pii-warning' + (hasPII ? ' visible' : '');
    }

    function toggleSchedule() {
      scheduleMode = !scheduleMode;
      const row = document.getElementById('scheduleRow');
      const btn = document.getElementById('btnSchedule');
      row.className = 'schedule-row' + (scheduleMode ? ' visible' : '');
      btn.className = 'btn btn-secondary' + (scheduleMode ? ' active' : '');

      if (scheduleMode) {
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        document.getElementById('scheduleTime').value = now.toISOString().slice(0, 16);
      }
    }

    function showFeedback(msg, type) {
      const el = document.getElementById('composeFeedback');
      el.textContent = msg;
      el.className = 'compose-feedback ' + type;
      setTimeout(() => { el.className = 'compose-feedback'; }, 5000);
    }

    async function postNow() {
      const text = document.getElementById('composeText').value.trim();
      if (!text) return;

      const platform = document.getElementById('composePlatform').value;
      const imageUrl = document.getElementById('composeImage').value.trim() || undefined;

      document.getElementById('btnPost').disabled = true;
      try {
        const data = await api('/publish', {
          method: 'POST',
          body: JSON.stringify({ platform, text, image_url: imageUrl }),
        });

        if (data.error) {
          showFeedback('Failed: ' + data.error, 'error');
        } else {
          showFeedback('Published: ' + (data.url || 'success'), 'success');
          document.getElementById('composeText').value = '';
          updateCompose();
          loadQueue();
          loadHistory();
          loadFeed();
        }
      } catch (err) {
        showFeedback('Network error', 'error');
      }
      document.getElementById('btnPost').disabled = false;
    }

    document.getElementById('composeText').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postNow();
    });

    // Schedule
    document.getElementById('btnSchedule').addEventListener('click', async function() {
      if (!scheduleMode) return; // toggleSchedule handles the first click

      const text = document.getElementById('composeText').value.trim();
      if (!text) return;

      const time = document.getElementById('scheduleTime').value;
      if (!time) { showFeedback('Pick a date/time', 'error'); return; }

      const platform = document.getElementById('composePlatform').value;
      const imageUrl = document.getElementById('composeImage').value.trim() || undefined;

      try {
        const data = await api('/schedule', {
          method: 'POST',
          body: JSON.stringify({
            platform, text,
            image_url: imageUrl,
            scheduled_at: new Date(time).toISOString(),
          }),
        });

        if (data.error) {
          showFeedback('Failed: ' + data.error, 'error');
        } else {
          showFeedback('Scheduled for ' + new Date(time).toLocaleString(), 'success');
          document.getElementById('composeText').value = '';
          updateCompose();
          toggleSchedule();
          loadQueue();
        }
      } catch {
        showFeedback('Network error', 'error');
      }
    });

    // ─── Queue ──────────────────────────────
    async function loadQueue() {
      try {
        const data = await api('/drafts');
        const el = document.getElementById('queueBody');
        document.getElementById('queueCount').textContent = data.count > 0 ? data.count + ' item' + (data.count > 1 ? 's' : '') : '';

        if (!data.items || data.items.length === 0) {
          el.innerHTML = '<div class="empty-state">No scheduled posts</div>';
          return;
        }

        el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Status</th><th>Platform</th><th>Content</th><th>Scheduled</th><th></th></tr></thead><tbody>' +
          data.items.map(item => '<tr>' +
            '<td><span class="status-badge status-' + item.status + '">' + item.status + '</span></td>' +
            '<td class="text-dim">' + item.platform + '</td>' +
            '<td class="text-preview">' + esc(item.content) + '</td>' +
            '<td class="text-dim">' + (item.scheduled_at ? fmtTime(item.scheduled_at) : '&mdash;') + '</td>' +
            '<td>' + (item.status !== 'published' ? '<button class="btn btn-danger" onclick="cancelDraft(\\'' + item.id + '\\')">Cancel</button>' : '') + '</td>' +
          '</tr>').join('') +
          '</tbody></table></div>';
      } catch {
        document.getElementById('queueBody').innerHTML = '<div class="empty-state">Failed to load queue</div>';
      }
    }

    async function cancelDraft(id) {
      await api('/drafts/' + id, { method: 'DELETE' });
      loadQueue();
    }

    // ─── History ────────────────────────────
    async function loadHistory() {
      try {
        const data = await api('/history');
        const el = document.getElementById('historyBody');

        if (!data.items || data.items.length === 0) {
          el.innerHTML = '<div class="empty-state">No publish history yet</div>';
          return;
        }

        el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Status</th><th>Platform</th><th>Content</th><th>Link</th><th>Time</th></tr></thead><tbody>' +
          data.items.map(item => '<tr>' +
            '<td><span class="status-badge status-' + item.status + '">' + item.status + '</span></td>' +
            '<td class="text-dim">' + item.platform + '</td>' +
            '<td class="text-preview">' + esc(item.content) + '</td>' +
            '<td>' + (item.post_url ? '<a class="text-link" href="' + esc(item.post_url) + '" target="_blank" rel="noopener">View</a>' : '&mdash;') + '</td>' +
            '<td class="text-dim">' + fmtTime(item.created_at) + '</td>' +
          '</tr>').join('') +
          '</tbody></table></div>';
      } catch {
        document.getElementById('historyBody').innerHTML = '<div class="empty-state">Failed to load history</div>';
      }
    }

    // ─── Feed ───────────────────────────────
    async function loadFeed() {
      try {
        const data = await api('/feed/bluesky?limit=10');
        const el = document.getElementById('feedBody');

        if (!data.items || data.items.length === 0) {
          el.innerHTML = '<div class="empty-state">No posts found</div>';
          return;
        }

        el.innerHTML = data.items.map(item =>
          '<div class="feed-item">' +
            '<div class="feed-text">' + esc(item.text) + '</div>' +
            '<div class="feed-meta">' +
              '<span class="feed-stat"><span class="count">' + item.likeCount + '</span> likes</span>' +
              '<span class="feed-stat"><span class="count">' + item.repostCount + '</span> reposts</span>' +
              '<span class="feed-stat"><span class="count">' + item.replyCount + '</span> replies</span>' +
              '<span class="text-dim">' + fmtTime(item.createdAt) + '</span>' +
              '<a class="text-link" href="' + esc(item.url) + '" target="_blank" rel="noopener">Open</a>' +
            '</div>' +
          '</div>'
        ).join('');
      } catch {
        document.getElementById('feedBody').innerHTML = '<div class="empty-state">Failed to load feed</div>';
      }
    }

    // ─── Helpers ────────────────────────────
    function esc(s) {
      if (!s) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function fmtTime(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso.includes('T') ? iso : iso + 'Z');
        const now = new Date();
        const diff = now - d;

        if (diff > 0 && diff < 86400000) {
          const h = Math.floor(diff / 3600000);
          if (h > 0) return h + 'h ago';
          const m = Math.floor(diff / 60000);
          return m + 'm ago';
        }

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
          ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch { return iso; }
    }
  </script>
</body>
</html>`;
}
