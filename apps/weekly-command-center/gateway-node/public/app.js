const API = "/api";

let currentWeek = null;

async function jsonFetch(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function loadCalendarStrip() {
  const cal = await jsonFetch(`${API}/calendars/today`);
  const el = document.getElementById("calendar-strip");
  el.innerHTML = `
    <span><b>${cal.gregorian}</b></span>
    <span>ISO ${cal.iso_week}</span>
    <span>JDN ${cal.julian_day}</span>
    <span>Maya ${cal.mayan.long_count} · ${cal.mayan.tzolkin}</span>
    <span>${cal.chinese.label} (${cal.chinese.animal})</span>
    <span>Hijri ${cal.hijri.day} ${cal.hijri.month} ${cal.hijri.year}</span>
  `;
}

async function loadDigest() {
  const digest = await jsonFetch(`${API}/digest`);
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

async function loadAllDeliverables() {
  const items = await jsonFetch(`${API}/deliverables`);
  return items;
}

async function loadTaskTree() {
  const week = await jsonFetch(`${API}/weeks/current`);
  currentWeek = week;
  const tree = await jsonFetch(`${API}/weeks/${week.id}/tasks`);
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
      await fetch(`${API}/tasks/${id}`, {
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
  const tree = await jsonFetch(`${API}/folders/tree`);
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
  const doc = await jsonFetch(`${API}/documents/${docId}`);
  document.getElementById("doc-modal-title").textContent = `${doc.name} (rev ${doc.revision_number})`;
  document.getElementById("doc-modal-content").value = doc.content;
  document.getElementById("doc-modal-history").classList.add("hidden");
  document.getElementById("doc-modal").classList.remove("hidden");
}

async function loadLibraries() {
  const libs = await jsonFetch(`${API}/libraries`);
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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function wireForms() {
  document.getElementById("quick-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const line = e.target.line.value.trim();
    if (!line) return;
    const parsed = await jsonFetch(`${API}/tasks/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line }),
    });
    await jsonFetch(`${API}/tasks`, {
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
  });

  document.getElementById("deliverable-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    await jsonFetch(`${API}/deliverables`, {
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
  });

  document.getElementById("folder-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    await jsonFetch(`${API}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    e.target.reset();
    loadFolderTree();
  });

  document.getElementById("optimize-btn").addEventListener("click", async () => {
    if (!currentWeek) return;
    const result = await jsonFetch(`${API}/weeks/${currentWeek.id}/optimize`, {
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
    await jsonFetch(`${API}/documents/${openDocId}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, author: "user" }),
    });
    openDocModal(openDocId);
  });

  document.getElementById("doc-modal-history-toggle").addEventListener("click", async () => {
    const history = await jsonFetch(`${API}/documents/${openDocId}/history`);
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
  wireForms();
  await Promise.all([loadCalendarStrip(), loadDigest(), loadTaskTree(), loadFolderTree(), loadLibraries()]);
}

boot();
