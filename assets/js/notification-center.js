// Drop-in notification bell + panel.
// Usage:
//   import { mountNotificationCenter } from "./notification-center.js";
//   mountNotificationCenter(document.getElementById("notifSlot"), { type:"restaurant", id:"demo" });
import {
  setRecipient, listNotifications, unreadCount, markRead, markAllRead,
  on, enableBrowserPush, KIND_META, timeAgo, pushNotification,
} from "./notifications.js";

export function mountNotificationCenter(slot, recipient) {
  setRecipient(recipient);

  slot.innerHTML = `
    <div class="notif-wrap">
      <button class="notif-bell" id="notifBell" aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        <span class="notif-dot" id="notifDot" hidden></span>
      </button>
      <div class="notif-panel" id="notifPanel" hidden>
        <header class="notif-head">
          <div class="font-display font-bold text-lg">Notifications</div>
          <div class="flex items-center gap-2">
            <button id="notifPush" class="notif-mini" title="Enable browser push">🔔</button>
            <button id="notifMarkAll" class="notif-mini">Mark all read</button>
          </div>
        </header>
        <div class="notif-filters" id="notifFilters">
          <button class="notif-chip on" data-filter="all">All</button>
          <button class="notif-chip"    data-filter="unread">Unread</button>
          <button class="notif-chip"    data-filter="requests">Requests</button>
          <button class="notif-chip"    data-filter="system">System</button>
        </div>
        <div class="notif-list" id="notifList"></div>
      </div>
    </div>
  `;

  const bell  = slot.querySelector("#notifBell");
  const panel = slot.querySelector("#notifPanel");
  const dot   = slot.querySelector("#notifDot");
  const list  = slot.querySelector("#notifList");
  let currentFilter = "all";

  bell.addEventListener("click", async () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) await render();
  });
  document.addEventListener("click", (e) => {
    if (!slot.contains(e.target)) panel.hidden = true;
  });

  slot.querySelectorAll(".notif-chip").forEach(c => c.addEventListener("click", async () => {
    slot.querySelectorAll(".notif-chip").forEach(x => x.classList.remove("on"));
    c.classList.add("on");
    currentFilter = c.dataset.filter;
    await render();
  }));

  slot.querySelector("#notifMarkAll").addEventListener("click", async (e) => {
    e.stopPropagation();
    await markAllRead();
    await render(); await refreshDot();
  });

  slot.querySelector("#notifPush").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await enableBrowserPush();
    flashToast(ok ? "Browser push enabled" : "Push not granted");
  });

  on(async (evt) => {
    if (evt.type === "incoming") {
      flashToast(evt.notification.title);
      pulse(dot);
    }
    await refreshDot();
    if (!panel.hidden) await render();
  });

  refreshDot();

  async function render() {
    const all = await listNotifications({ limit: 50 });
    let view = all;
    if (currentFilter === "unread")   view = all.filter(n => !n.read_at);
    if (currentFilter === "requests") view = all.filter(n => n.kind?.startsWith("request_") || n.kind === "rider_arrived" || n.kind === "delivery_completed");
    if (currentFilter === "system")   view = all.filter(n => !n.kind?.startsWith("request_") && !["rider_arrived","delivery_completed"].includes(n.kind));

    if (!view.length) {
      list.innerHTML = `<div class="notif-empty">All clear. Nothing to coordinate right now.</div>`;
      return;
    }
    list.innerHTML = view.map(n => {
      const meta = KIND_META[n.kind] || KIND_META.system;
      const unread = !n.read_at;
      return `
        <button class="notif-item ${unread ? "unread" : ""}" data-id="${n.id}">
          <span class="notif-icon tone-${meta.tone}">${meta.icon}</span>
          <span class="notif-body">
            <span class="notif-title">${escape(n.title)}</span>
            ${n.body ? `<span class="notif-sub">${escape(n.body)}</span>` : ""}
            <span class="notif-time">${timeAgo(n.created_at)}</span>
          </span>
        </button>`;
    }).join("");
    list.querySelectorAll(".notif-item").forEach(b => b.addEventListener("click", async () => {
      await markRead(b.dataset.id);
      b.classList.remove("unread");
      await refreshDot();
    }));
  }

  async function refreshDot() {
    const c = await unreadCount();
    dot.hidden = c === 0;
    dot.textContent = c > 9 ? "9+" : (c || "");
  }

  function pulse(el) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
}

function escape(s) { return String(s ?? "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

function flashToast(msg) {
  let el = document.querySelector(".notif-toast");
  if (!el) { el = document.createElement("div"); el.className = "notif-toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3200);
}

// Re-export for callers who want to dispatch from page code
export { pushNotification };
