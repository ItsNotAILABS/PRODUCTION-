// Admin analytics dashboard — a separate page from the main tenant app
// (index.html/app.js), authenticated with the operator's ADMIN_API_KEY
// rather than a tenant JWT. Talks to the /admin/analytics/* endpoints,
// which are scoped by admin_auth.py, never by get_current_account.
const API = "/api";
const ADMIN_KEY_STORAGE = "wcc_admin_key";

function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

function setAdminKey(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

async function adminJson(path) {
  const key = getAdminKey();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 503) {
    clearAdminKey();
    showKeyScreen(res.status === 503 ? "Admin API not configured on the server (ADMIN_API_KEY unset)" : "Invalid admin key");
    throw new Error(`${path} -> ${res.status}`);
  }
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function showKeyScreen(errorMsg) {
  document.getElementById("key-screen").classList.remove("hidden");
  document.getElementById("admin-shell").classList.add("hidden");
  if (errorMsg) document.getElementById("key-error").textContent = errorMsg;
}

function showAdminShell() {
  document.getElementById("key-screen").classList.add("hidden");
  document.getElementById("admin-shell").classList.remove("hidden");
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function statTile(value, label) {
  return `<div class="stat-tile"><div class="value">${value}</div><div class="label">${label}</div></div>`;
}

async function loadOverview() {
  const o = await adminJson("/admin/analytics/overview");
  document.getElementById("overview-stats").innerHTML = [
    statTile(money(o.mrr_cents), "MRR"),
    statTile(money(o.arr_cents), "ARR"),
    statTile(o.total_accounts, "Total accounts"),
    statTile(o.paying_accounts, "Paying accounts"),
    statTile(o.free_accounts, "Free accounts"),
    statTile(o.total_users, "Total users"),
    statTile(money(o.avg_revenue_per_paying_account_cents), "Avg $/paying account"),
  ].join("");
}

async function loadPlans() {
  const plans = await adminJson("/admin/analytics/plans");
  const maxCount = Math.max(1, ...plans.map((p) => p.account_count));
  document.getElementById("plans-bars").innerHTML = plans
    .map(
      (p) => `
    <div class="bar-row">
      <span class="bar-label">${p.name}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(p.account_count / maxCount) * 100}%"></span></span>
      <span class="bar-count">${p.account_count}</span>
    </div>`
    )
    .join("");
}

async function loadUsage() {
  const u = await adminJson("/admin/analytics/usage");
  document.getElementById("usage-stats").innerHTML = [
    statTile(u.total_tasks, "Total tasks"),
    statTile(u.open_tasks, "Open tasks"),
    statTile(u.total_deliverables, "Total deliverables"),
    statTile(u.avg_tasks_per_account.toFixed(1), "Avg tasks / account"),
    statTile(u.avg_deliverables_per_account.toFixed(1), "Avg deliverables / account"),
  ].join("");
}

async function loadSignups() {
  const { weeks } = await adminJson("/admin/analytics/signups?weeks=12");
  document.getElementById("signups-list").innerHTML = weeks
    .map((w) => `<li><b>${w.week_start}</b> — ${w.signups} new account${w.signups === 1 ? "" : "s"}</li>`)
    .join("") || "<li>No signups yet</li>";
}

async function loadRetention() {
  const { weeks } = await adminJson("/admin/analytics/retention?weeks=8");
  document.getElementById("retention-list").innerHTML = weeks
    .map((w) => `<li><b>${w.week_start}</b> — ${w.active_accounts} active account${w.active_accounts === 1 ? "" : "s"}</li>`)
    .join("") || "<li>No activity yet</li>";
}

async function loadAll() {
  await Promise.all([loadOverview(), loadPlans(), loadUsage(), loadSignups(), loadRetention()]);
}

document.getElementById("key-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = new FormData(e.target).get("admin_key");
  setAdminKey(key);
  try {
    await loadAll();
    showAdminShell();
  } catch (err) {
    // showKeyScreen already called by adminJson on 401/503; for other
    // errors (network, 500), surface a generic message.
    if (getAdminKey()) document.getElementById("key-error").textContent = "Could not load analytics";
  }
});

document.getElementById("refresh-btn").addEventListener("click", loadAll);

if (getAdminKey()) {
  loadAll().then(showAdminShell).catch(() => {});
}
