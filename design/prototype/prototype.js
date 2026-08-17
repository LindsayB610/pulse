const reminders = [
  { id: "water-plants", title: "Water houseplants", active: true, day: "Sunday", time: "9:30 AM", zone: "PT", next: "Sunday at 9:30 AM", repeat: 30, snooze: 30, state: "scheduled" },
  { id: "recycling", title: "Take recycling out", active: true, day: "Wednesday", time: "7:00 PM", zone: "PT", next: "Tomorrow at 7:00 PM", repeat: 60, snooze: 1440, state: "due" },
  { id: "air-filter", title: "Replace air filter", active: false, day: "Saturday", time: "10:00 AM", zone: "PT", next: "Paused", repeat: 1440, snooze: 1440, state: "paused" },
];

const history = [
  { title: "Water houseplants", detail: "Completed after 1 snooze", at: "Sun, Aug 2 · 9:58 AM" },
  { title: "Take recycling out", detail: "Completed on first notification", at: "Wed, Jul 29 · 7:04 PM" },
  { title: "Water houseplants", detail: "Completed on first notification", at: "Sun, Jul 26 · 9:34 AM" },
];

const $ = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const main = $("#pulse-main");
const dialogRoot = $("#dialog-root");
let dialogReturnFocus = null;

function formatMinutes(value) {
  if (value === 1440) return "1 day";
  if (value % 60 === 0) return `${value / 60} ${value === 60 ? "hour" : "hours"}`;
  return `${value} min`;
}

function formatTimeInput(value) {
  const [hourText, minute = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

function icon(name) {
  const icons = { plus: "+", edit: "✎", pause: "Ⅱ", play: "▶", chevron: "›", check: "✓", pulse: "⌁", warning: "!" };
  return `<span aria-hidden="true">${icons[name] ?? "·"}</span>`;
}

function pageHead(eyebrow, title, description, action = "") {
  return `<header class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-description">${description}</p></div>${action}</header>`;
}

function summary(state = "healthy", empty = false) {
  const health = state === "healthy"
    ? `<span class="status-line status-positive"><i class="status-dot"></i>Online</span><div class="summary-note">Checked just now</div>`
    : state === "stale"
      ? `<span class="status-line status-warning"><i class="status-dot"></i>Needs attention</span><div class="summary-note">Last check 18 minutes ago</div>`
      : `<span class="status-line status-danger"><i class="status-dot"></i>Unavailable</span><div class="summary-note">Connection failed</div>`;
  return `<section class="summary-grid" aria-label="Pulse summary">
    <article class="summary-card"><span class="summary-label">Active reminders</span><div class="summary-value">${empty ? "0" : "2"}</div><div class="summary-note">${empty ? "No reminders saved" : "1 paused"}</div></article>
    <article class="summary-card"><span class="summary-label">Next notification</span><div class="summary-value compact">${empty ? "Nothing scheduled" : "Due now"}</div>${empty ? "" : '<div class="summary-note">Take recycling out</div>'}</article>
    <article class="summary-card"><span class="summary-label">Runner health</span><div class="summary-value compact">${health}</div></article>
  </section>`;
}

function reminderCard(item) {
  const cardState = item.state === "due" ? " is-due" : item.active ? "" : " is-paused";
  const status = item.state === "due" ? `<span class="badge due">Due now</span>` : item.active ? `<span class="badge">Active</span>` : `<span class="badge">Paused</span>`;
  return `<article class="reminder-card${cardState}" data-reminder-id="${item.id}">
    <div><div class="reminder-title-row"><h3>${item.title}</h3>${status}</div>
      <p class="schedule">Every ${item.day} at ${item.time} ${item.zone}</p>
      <p class="next-due">${item.state === "due" ? "Notification active now" : item.active ? `Next: ${item.next}` : "No notifications while paused"}</p>
      <div class="policy"><span>${icon("pulse")}Repeats every ${formatMinutes(item.repeat)} until done</span><span>↷ Untouched: ${formatMinutes(item.snooze)}</span></div>
    </div>
    <div class="card-actions"><button class="button button-quiet" data-edit="${item.id}">${icon("edit")}Edit</button><button class="button button-quiet" data-toggle="${item.id}">${item.active ? icon("pause") + "Pause" : icon("play") + "Resume"}</button></div>
  </article>`;
}

function remindersView({ empty = false, health = "healthy" } = {}) {
  setSidebarHealth(health);
  main.innerHTML = `<div class="content-frame">${pageHead("Persistent reminders", "Reminders", "Set the schedule here. When one is due, your phone keeps asking until you tap Done.", `<a class="button button-primary" href="#/new">${icon("plus")} New reminder</a>`)}
    ${summary(health, empty)}
    <section aria-labelledby="active-title"><div class="section-heading"><div><h2 id="active-title">Your reminders</h2><p>${empty ? "Ready when you are." : "Ordered by what needs attention next."}</p></div></div>
    ${empty ? `<div class="empty-state"><div class="empty-orbit">${icon("pulse")}</div><h2>No reminders yet</h2><p>Create one persistent reminder and Pulse will keep it on your phone until the occurrence is done.</p><a class="button button-primary" href="#/new">Create your first reminder</a></div>` : `<div class="reminder-list">${reminders.map(reminderCard).join("")}</div>`}</section></div>`;
  bindReminderActions();
}

function formView(mode = "new", reminder = reminders[0]) {
  const editing = mode === "edit";
  const title = editing ? reminder.title : "";
  main.innerHTML = `<div class="content-frame">${pageHead(editing ? "Manage reminder" : "New reminder", editing ? "Edit reminder" : "Create a reminder", editing ? "Changes apply to future notifications. Completion history stays intact." : "Choose when Pulse starts and how insistently it should return until you tap Done.")}
  <div class="form-layout"><form class="panel form-card" id="reminder-form">
    <section class="form-section"><div class="form-section-head"><h2>What should Pulse remember?</h2><p>Keep it short enough to read from a notification.</p></div>
      <label class="field">Reminder name<input class="input" name="title" value="${title}" placeholder="e.g. Water houseplants" required /></label>
    </section>
    <section class="form-section"><div class="form-section-head"><h2>Schedule</h2><p>The current Pulse engine supports a weekly schedule.</p></div>
      <div class="field-grid"><label class="field">Repeats<select class="select" name="cadence" disabled><option>Weekly</option></select><span class="field-help">Daily and monthly arrive with bounded recurrence.</span></label>
      <label class="field">Day<select class="select" name="day"><option>Sunday</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option></select></label>
      <label class="field">Time<input class="input" type="time" name="time" value="${editing ? "09:30" : "09:00"}" /></label>
      <label class="field">Time zone<select class="select" name="timezone"><option>Pacific Time (PT)</option><option>Mountain Time (MT)</option><option>Central Time (CT)</option><option>Eastern Time (ET)</option></select></label></div>
    </section>
    <section class="form-section"><div class="form-section-head"><h2>Notification behavior</h2><p>Done stops the current occurrence. These controls decide when Pulse asks again.</p></div>
      ${timingField("repeat", "While it’s due, repeat every", editing ? reminder.repeat : 30)}
      <div style="height:18px"></div>${timingField("snooze", "If I don’t respond within 2 minutes", editing ? reminder.snooze : 30)}
    </section>
    <footer class="form-footer">${editing ? `<button type="button" class="button button-danger" id="delete-reminder">Delete reminder</button>` : `<span></span>`}<div class="form-footer-right"><a class="button button-secondary" href="#/reminders">Cancel</a><button class="button button-primary" type="submit">${editing ? "Save changes" : "Create reminder"}</button></div></footer>
  </form><aside class="form-aside"><article class="panel preview-card"><small>Notification preview</small><strong id="preview-title">${title || "Your reminder"}</strong><p id="preview-schedule">Due ${editing ? reminder.day : "Sunday"} at ${formatTimeInput(editing ? "09:30" : "09:00")} PT</p></article><article class="panel tip-card"><h3>Phone actions stay on your phone</h3><p>Done completes this occurrence. Snooze follows the timing you choose here.</p></article></aside></div></div>`;
  bindForm(editing, reminder);
}

function timingField(name, label, selected) {
  const choices = [30, 60, 240, 1440];
  const isCustom = !choices.includes(selected);
  return `<fieldset class="field" style="border:0;padding:0;margin:0"><legend style="margin-bottom:9px">${label}</legend><div class="segmented">${choices.map(value => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${selected === value ? "checked" : ""}/><span>${formatMinutes(value)}</span></label>`).join("")}<label class="choice"><input type="radio" name="${name}" value="custom" ${isCustom ? "checked" : ""}/><span>Custom</span></label></div><div class="custom-timing ${isCustom ? "is-visible" : ""}" data-custom-for="${name}"><label class="field">Minutes<input class="input" type="number" min="1" value="${isCustom ? selected : 90}" name="${name}-custom" /></label></div></fieldset>`;
}

function historyView(empty = false) {
  main.innerHTML = `<div class="content-frame">${pageHead("Completion record", "History", "A durable record of what Pulse asked and when it was completed.")}
  ${empty ? `<div class="empty-state"><div class="empty-orbit">${icon("check")}</div><h2>No completed reminders yet</h2><p>Completed occurrences will appear here with their notification and Snooze history.</p></div>` : `<section class="panel history-list" aria-label="Completed occurrences">${history.map(item => `<article class="history-row"><span class="history-icon">✓</span><div><h3>${item.title}</h3><p>${item.detail}</p></div><time>${item.at}</time></article>`).join("")}</section>`}</div>`;
}

function settingsView(health = "healthy") {
  setSidebarHealth(health);
  const callout = health === "healthy" ? { cls:"", icon:"✓", title:"Runner is online", copy:"Pulse checked the cloud runner just now. Notifications can fire while this computer is off." } : health === "stale" ? { cls:"warning", icon:"!", title:"Runner check is late", copy:"The last successful check was 18 minutes ago. Open deployment help if this continues." } : { cls:"danger", icon:"×", title:"Runner is unavailable", copy:"Pulse could not reach the configured service. Reconnect the private folder or check the deployment." };
  main.innerHTML = `<div class="content-frame">${pageHead("Connection & delivery", "Settings", "See what Pulse is connected to without exposing private credentials in Workshop.")}
    <section class="panel"><div class="health-callout ${callout.cls}"><span class="history-icon">${callout.icon}</span><div><h3>${callout.title}</h3><p>${callout.copy}</p></div></div>
    <div class="settings-grid"><div class="settings-row"><div><h3>Private Pulse folder</h3><p>Contains pulse.config.json; credentials stay in the system keychain.</p></div><button class="button button-secondary" id="reconnect">Reconnect</button></div>
    <div class="settings-row"><div><h3>Service endpoint</h3><p>Connected securely through Workshop’s constrained service bridge.</p></div><span class="badge">Configured</span></div>
    <div class="settings-row"><div><h3>Notification delivery</h3><p>Android push through ntfy · Done and Snooze enabled.</p></div><span class="status-line status-positive"><i class="status-dot"></i>Ready</span></div></div></section>
    <section class="panel" style="margin-top:14px"><div class="section-heading"><div><h2>Prototype health states</h2><p>Design-review control; not part of production settings.</p></div></div><div class="segmented"><button class="button button-secondary" data-health="healthy">Healthy</button><button class="button button-secondary" data-health="stale">Stale</button><button class="button button-secondary" data-health="down">Unavailable</button></div></section>
  </div>`;
  all("[data-health]").forEach(button => button.addEventListener("click", () => settingsView(button.dataset.health)));
  $("#reconnect")?.addEventListener("click", () => location.hash = "#/setup");
  window.scrollTo(0, 0);
}

function setupView(failed = false) {
  setSidebarHealth("down");
  main.innerHTML = `<div class="setup-shell"><section class="setup-card"><div class="pulse-brand"><span class="pulse-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Pulse</span></div><p class="eyebrow">Private connection</p><h1>Connect your reminders</h1><p>Choose the private Pulse folder that contains <strong>pulse.config.json</strong>. Workshop reads the connection details; your keychain credential never enters this view.</p>
    <form class="setup-form" id="setup-form"><label class="field">Private Pulse folder<input class="input" value="/Users/you/Documents/workshop-private/pulse" /></label>${failed ? `<div class="error-box"><strong>!</strong><span>Pulse could not find a valid pulse.config.json in that folder. Choose the private Pulse folder, not the public code repository.</span></div>` : ""}<button class="button button-primary" type="submit">Connect Pulse</button><button class="button button-quiet" type="button" id="show-failure">Preview connection error</button></form></section></div>`;
  $("#setup-form")?.addEventListener("submit", event => { event.preventDefault(); showToast("Pulse connected"); location.hash = "#/reminders"; });
  $("#show-failure")?.addEventListener("click", () => setupView(true));
}

function compareView() {
  setSidebarHealth("healthy");
  main.innerHTML = `<div class="compare-page"><header class="compare-intro"><p class="eyebrow">D0 design review</p><h1>Three directions. One Pulse.</h1><p>Each direction uses the same product truth. The difference is how loudly the interface speaks. Quiet Focus is the recommendation: personal, modern, and serious without feeling clinical.</p></header><section class="directions" aria-label="Visual directions">
    ${directionCard("quiet", "Quiet Focus", "Controlled contrast, calm cards, and a single vivid Pulse accent. Best fit for a personal obligation system.", true)}
    ${directionCard("ledger", "Soft Ledger", "Warm, tactile, and approachable. Beautiful, but the light surface fights Workshop’s dark host more than it helps.")}
    ${directionCard("signal", "Signal Grid", "Crisp and operational with stronger telemetry energy. Useful, but too close to a developer console for personal reminders.")}
  </section></div>`;
  all("[data-open-direction]").forEach(button => button.addEventListener("click", () => { document.body.dataset.direction = button.dataset.openDirection; location.hash = "#/reminders"; }));
}

function directionCard(id, name, copy, recommended = false) {
  return `<article class="direction-card direction-${id}"><div class="direction-preview"><div class="mini-top"><span class="mini-brand">Pulse</span><span class="mini-add">+</span></div><div class="mini-label">Persistent reminders</div><div class="mini-title">Reminders</div><div class="mini-summary"><div><small>Active</small><strong>2 reminders</strong></div><div><small>Runner</small><strong>● Online</strong></div></div><div class="mini-item"><strong>Water houseplants</strong><span>Every Sunday · 9:30 AM</span></div><div class="mini-item"><strong>Take recycling out</strong><span>Tomorrow · 7:00 PM</span></div></div><div class="direction-meta"><h2>${name}${recommended ? `<span class="recommendation">● Recommended</span>` : ""}</h2><p>${copy}</p><button class="button ${recommended ? "button-primary" : "button-secondary"}" data-open-direction="${id}">Open ${name}</button></div></article>`;
}

function bindReminderActions() {
  all("[data-edit]").forEach(button => button.addEventListener("click", () => location.hash = `#/edit/${button.dataset.edit}`));
  all("[data-toggle]").forEach(button => button.addEventListener("click", () => { const reminder = reminders.find(item => item.id === button.dataset.toggle); reminder.active = !reminder.active; reminder.state = reminder.active ? "scheduled" : "paused"; showToast(reminder.active ? `${reminder.title} resumed` : `${reminder.title} paused`); remindersView(); }));
}

function bindForm(editing, reminder) {
  const form = $("#reminder-form");
  const title = $("[name='title']", form);
  const day = $("[name='day']", form);
  const time = $("[name='time']", form);
  const updatePreview = () => {
    $("#preview-title").textContent = title.value || "Your reminder";
    $("#preview-schedule").textContent = `Due ${day.value} at ${formatTimeInput(time.value)} PT`;
  };
  title.addEventListener("input", updatePreview);
  day.addEventListener("change", updatePreview);
  time.addEventListener("input", updatePreview);
  all("input[type='radio']", form).forEach(input => input.addEventListener("change", () => { const panel = $(`[data-custom-for='${input.name}']`, form); panel?.classList.toggle("is-visible", input.value === "custom"); }));
  form.addEventListener("submit", event => { event.preventDefault(); showToast(editing ? "Reminder updated" : "Reminder created"); location.hash = "#/reminders"; });
  $("#delete-reminder")?.addEventListener("click", () => openDeleteDialog(reminder));
}

function openDeleteDialog(reminder) {
  dialogReturnFocus = document.activeElement;
  dialogRoot.innerHTML = `<div class="dialog-backdrop" role="presentation"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete “${reminder.title}”?</h2><p>This stops future occurrences. Existing completion history stays in Pulse.</p><div class="dialog-actions"><button class="button button-secondary" id="cancel-delete">Cancel</button><button class="button button-danger" id="confirm-delete">Delete reminder</button></div></section></div>`;
  $("#cancel-delete").addEventListener("click", closeDialog);
  $("#confirm-delete").addEventListener("click", () => { closeDialog(); showToast("Reminder deleted"); location.hash = "#/reminders"; });
  $("#cancel-delete").focus();
  document.addEventListener("keydown", closeDialogOnEscape);
}

function closeDialogOnEscape(event) { if (event.key === "Escape") closeDialog(); }
function closeDialog() { dialogRoot.innerHTML = ""; document.removeEventListener("keydown", closeDialogOnEscape); dialogReturnFocus?.focus(); dialogReturnFocus = null; }
function showToast(message) { const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; $("#toast-region").append(toast); setTimeout(() => toast.remove(), 2600); }

function setSidebarHealth(state) {
  const sidebar = $(".sidebar-health");
  const content = state === "healthy"
    ? { title: "Runner online", detail: "Checked just now", label: "Runner online; checked just now" }
    : state === "stale"
      ? { title: "Runner needs attention", detail: "Last check 18 min ago", label: "Runner needs attention; last check 18 minutes ago" }
      : { title: "Runner unavailable", detail: "Connection failed", label: "Runner unavailable; connection failed" };
  sidebar.dataset.health = state;
  $("strong", sidebar).textContent = content.title;
  $("small", sidebar).textContent = content.detail;
  sidebar.setAttribute("aria-label", content.label);
}

function route() {
  const path = location.hash.replace(/^#\//, "") || "compare";
  const [name, id] = path.split("/");
  all("[data-route]").forEach(link => {
    if (link.dataset.route === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.body.classList.toggle("is-review", name === "compare");
  if (name === "compare") compareView();
  else if (name === "reminders") remindersView();
  else if (name === "empty") remindersView({ empty: true });
  else if (name === "new") formView("new");
  else if (name === "edit") formView("edit", reminders.find(item => item.id === id) ?? reminders[0]);
  else if (name === "history") historyView();
  else if (name === "history-empty") historyView(true);
  else if (name === "settings") settingsView();
  else if (name === "setup") setupView(false);
  else remindersView();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

$("#review-toggle").addEventListener("click", () => location.hash = "#/compare");
window.addEventListener("hashchange", route);
route();
