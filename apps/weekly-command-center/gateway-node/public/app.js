const API = "/api";
const TOKEN_KEY = "wcc_token";

let currentWeek = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function authFetch(url, opts = {}) {
  const token = getToken();
  const headers = Object.assign({}, opts.headers, token ? { Authorization: `Bearer ${token}` } : {});
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    showAuthScreen();
    throw new Error("session expired");
  }
  return res;
}

async function authJson(url, opts) {
  const res = await authFetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
}

function showAppShell() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
}

// --- calendar / digest / tasks / documents / libraries (unchanged data flow, now authenticated) ---

async function loadCalendarStrip() {
  const res = await fetch(`${API}/calendars/today`); // public, no auth needed
  const cal = await res.json();
  document.getElementById("calendar-strip").innerHTML = `
    <span><b>${cal.gregorian}</b></span>
    <span>ISO ${cal.iso_week}</span>
    <span>JDN ${cal.julian_day}</span>
    <span>Maya ${cal.mayan.long_count} · ${cal.mayan.tzolkin}</span>
    <span>${cal.chinese.label} (${cal.chinese.animal})</span>
    <span>Hijri ${cal.hijri.day} ${cal.hijri.month} ${cal.hijri.year}</span>
  `;
}

async function loadMe() {
  const me = await authJson(`${API}/auth/me`);
  document.getElementById("account-name").textContent = me.account.name;
  document.getElementById("account-plan").textContent = me.account.plan_name || me.account.plan_id;
}

async function loadDigest() {
  const digest = await authJson(`${API}/digest`);
  document.getElementById("digest-narrative").textContent = digest.narrative;
  document.getElementById("thread-badge").textContent =
    `Week #${digest.weeks_in_thread} in your continuous thread · ${digest.carried_over_count} carried over · ${digest.open_tasks} open / ${digest.done_tasks} done`;
  currentWeek = digest.week;
  renderDeliverables(digest.deliverables_under_pressure);
}

function renderDeliverables(items) {
  const ul = document.getElementById("deliverables-list");
  if (!items.length) {
    ul.innerHTML = `<li>Nothing under meaningful pressure right now.</li>`;
    return;
  }
  ul.innerHTML = items.map(d => `
    <li>
      <strong>${escapeHtml(d.title)}</strong> — due ${d.due_date}
      <span class="pressure-bar"><span style="width:${Math.round(d.pressure * 100)}%"></span></span>
      ${(d.pressure * 100).toFixed(0)}%
    </li>
  `).join("");
}

async function loadTaskTree() {
  const week = await authJson(`${API}/weeks/current`);
  currentWeek = week;
  const tree = await authJson(`${API}/weeks/${week.id}/tasks`);
  document.getElementById("task-tree").innerHTML = tree.map(renderTaskNode).join("") || "<p>No tasks yet this week.</p>";
  attachTaskHandlers();
}

function renderTaskNode(task) {
  const doneClass = task.status === "done" ? "done" : "";
  const children = (task.subtasks || []).map(renderTaskNode).join("");
  return `
    <div class="task-node">
      <div class="task-row ${doneClass}">
        <input type="checkbox" data-task-id="${task.id}" ${task.status === "done" ? "checked" : ""} />
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="priority-chip priority-${task.priority}">P${task.priority}</span>
        ${task.deadline ? `<span class="priority-chip">due ${task.deadline}</span>` : ""}
        ${task.carried_over_from ? `<span class="priority-chip">carried</span>` : ""}
      </div>
      ${children ? `<div class="task-children">${children}</div>` : ""}
    </div>
  `;
}

function attachTaskHandlers() {
  document.querySelectorAll('input[type="checkbox"][data-task-id]').forEach(cb => {
    cb.addEventListener("change", async () => {
      const id = cb.getAttribute("data-task-id");
      await authFetch(`${API}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: cb.checked ? "done" : "todo" }),
      });
      loadTaskTree();
      loadDigest();
    });
  });
}

async function loadFolderTree() {
  const tree = await authJson(`${API}/folders/tree`);
  document.getElementById("folder-tree").innerHTML = tree.map(renderFolderNode).join("") || "<p>No folders yet.</p>";
  attachDocHandlers();
}

function renderFolderNode(folder) {
  const docs = (folder.documents || []).map(d => `<span class="doc-link" data-doc-id="${d.id}">📄 ${escapeHtml(d.name)}</span>`).join("");
  const children = (folder.children || []).map(renderFolderNode).join("");
  return `
    <div class="folder-node">
      <div class="folder-name">📁 ${escapeHtml(folder.name)}</div>
      ${docs}
      ${children}
    </div>
  `;
}

function attachDocHandlers() {
  document.querySelectorAll(".doc-link").forEach(el => {
    el.addEventListener("click", () => openDocModal(el.getAttribute("data-doc-id")));
  });
}

let openDocId = null;

async function openDocModal(docId) {
  openDocId = docId;
  const doc = await authJson(`${API}/documents/${docId}`);
  document.getElementById("doc-modal-title").textContent = `${doc.name} (rev ${doc.revision_number})`;
  document.getElementById("doc-modal-content").value = doc.content;
  document.getElementById("doc-modal-history").classList.add("hidden");
  document.getElementById("doc-modal").classList.remove("hidden");
}

async function loadLibraries() {
  const res = await fetch(`${API}/libraries`); // public, platform-wide, no auth needed
  const libs = await res.json();
  const byLang = {};
  for (const lib of libs) {
    byLang[lib.language] = byLang[lib.language] || [];
    byLang[lib.language].push(lib);
  }
  const el = document.getElementById("libraries-list");
  el.innerHTML = Object.entries(byLang).map(([lang, items]) => `
    <div class="lib-lang-group">
      <h4>${lang} (${items.length})</h4>
      ${items.map(i => `<div>${escapeHtml(i.name)} <em>${escapeHtml(i.version)}</em></div>`).join("")}
    </div>
  `).join("") || "<p>No libraries scanned yet.</p>";
}

async function loadBilling() {
  const [current, plans] = await Promise.all([
    authJson(`${API}/billing/plan`),
    authJson(`${API}/billing/plans`),
  ]);
  const usage = current.usage;
  const limits = current.plan;
  const usageRow = (label, key, limitKey) => {
    const over = usage[key] >= limits[limitKey];
    return `<div class="usage-row${over ? " over" : ""}"><span>${label}</span><span>${usage[key]} / ${limits[limitKey]}</span></div>`;
  };
  document.getElementById("billing-usage").innerHTML = `
    ${usageRow("Users", "users", "max_users")}
    ${usageRow("Open tasks", "open_tasks", "max_open_tasks")}
    ${usageRow("Deliverables", "deliverables", "max_deliverables")}
  `;
  document.getElementById("billing-plans").innerHTML = plans.map(p => `
    <div class="plan-card ${p.id === limits.id ? "current" : ""}">
      <h4>${p.name}</h4>
      <div class="price">${p.price_cents === 0 ? "Free" : `$${(p.price_cents / 100).toFixed(0)}/mo`}</div>
      ${p.id === limits.id ? "<em>Current</em>" : `<button data-plan-id="${p.id}" class="upgrade-btn secondary">Switch</button>`}
    </div>
  `).join("");
  document.querySelectorAll(".upgrade-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await authFetch(`${API}/billing/upgrade?plan_id=${btn.getAttribute("data-plan-id")}`, { method: "POST" });
      loadBilling();
      loadMe();
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function wireAuthForms() {
  document.getElementById("tab-login").addEventListener("click", () => {
    document.getElementById("tab-login").classList.add("active");
    document.getElementById("tab-signup").classList.remove("active");
    document.getElementById("login-form").classList.remove("hidden");
    document.getElementById("signup-form").classList.add("hidden");
  });
  document.getElementById("tab-signup").addEventListener("click", () => {
    document.getElementById("tab-signup").classList.add("active");
    document.getElementById("tab-login").classList.remove("active");
    document.getElementById("signup-form").classList.remove("hidden");
    document.getElementById("login-form").classList.add("hidden");
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "login failed");
      setToken(data.access_token);
      showAppShell();
      boot();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById("signup-error");
    errorEl.textContent = "";
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: form.get("account_name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.detail && (data.detail[0]?.msg || data.detail)) || "signup failed");
      setToken(data.access_token);
      showAppShell();
      boot();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    clearToken();
    showAuthScreen();
  });
}

function wireForms() {
  document.getElementById("quick-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const line = e.target.line.value.trim();
    if (!line) return;
    const parsed = await authJson(`${API}/tasks/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line }),
    });
    await authFetch(`${API}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: parsed.title || line,
        deadline: parsed.due || null,
        priority: parsed.priority || 3,
        estimate_minutes: parsed.estimate_minutes || 0,
        tags: (parsed.tags || []).join(","),
      }),
    });
    e.target.reset();
    loadTaskTree();
    loadDigest();
    loadBilling();
  });

  document.getElementById("deliverable-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    await authFetch(`${API}/deliverables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        project: form.get("project") || "",
        due_date: form.get("due_date"),
      }),
    });
    e.target.reset();
    loadDigest();
    loadBilling();
  });

  document.getElementById("folder-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    await authFetch(`${API}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    e.target.reset();
    loadFolderTree();
  });

  document.getElementById("optimize-btn").addEventListener("click", async () => {
    if (!currentWeek) return;
    const result = await authJson(`${API}/weeks/${currentWeek.id}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_capacity_minutes: 360 }),
    });
    const el = document.getElementById("optimize-result");
    const days = Object.entries(result.plan).map(([day, items]) => `
      <div><strong>${day}</strong>: ${items.map(i => escapeHtml(i.title)).join(", ") || "—"}</div>
    `).join("");
    el.innerHTML = `<p>Engine: ${result.engine}</p>${days}`;
  });

  document.getElementById("doc-modal-save").addEventListener("click", async () => {
    if (!openDocId) return;
    const content = document.getElementById("doc-modal-content").value;
    await authFetch(`${API}/documents/${openDocId}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, author: "user" }),
    });
    openDocModal(openDocId);
  });

  document.getElementById("doc-modal-history-toggle").addEventListener("click", async () => {
    const history = await authJson(`${API}/documents/${openDocId}/history`);
    const ul = document.getElementById("doc-modal-history");
    ul.innerHTML = history.map(h => `<li>rev ${h.revision_number} — ${h.author} — ${h.created_at} (${h.chars} chars)</li>`).join("");
    ul.classList.toggle("hidden");
  });

  document.getElementById("doc-modal-close").addEventListener("click", () => {
    document.getElementById("doc-modal").classList.add("hidden");
    openDocId = null;
  });
}

async function boot() {
  await loadCalendarStrip();
  await loadMe();
  await Promise.all([loadDigest(), loadTaskTree(), loadFolderTree(), loadLibraries(), loadBilling()]);
}

wireAuthForms();
wireForms();

if (getToken()) {
  showAppShell();
  boot().catch(() => showAuthScreen());
} else {
  showAuthScreen();
  loadCalendarStrip();
}
