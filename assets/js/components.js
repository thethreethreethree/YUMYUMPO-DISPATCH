// Reusable HTML renderers + safe-string helpers.
// IMPORTANT: every template literal in this file (and any file consuming these
// helpers) MUST run user-supplied / DB-sourced fields through `esc()` for HTML
// text contexts, `attr()` for attribute values, and `safeUrl*()` for hrefs.

export const statusLabel = {
  online: "Online", available: "Available", busy: "Busy", offline: "Offline",
};

// ----- Safe-string helpers -------------------------------------------------
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#x2F;", "`": "&#x60;" };
export function esc(v) {
  return String(v ?? "").replace(/[&<>"'`/]/g, c => HTML_ESCAPES[c]);
}
// For values placed inside double-quoted attributes. Same as esc() in practice,
// but the dedicated alias documents intent at call sites.
export const attr = esc;

// Only allow http(s)/mailto/tel for arbitrary URLs. Falls back to "#".
export function safeUrl(v) {
  const s = String(v ?? "").trim();
  if (!s) return "#";
  if (/^(https?:|mailto:|tel:)/i.test(s)) return esc(s);
  return "#";
}
// Only allow http(s) for image sources.
export function safeImg(v, fallback = "") {
  const s = String(v ?? "").trim();
  if (!s) return esc(fallback);
  if (/^https?:\/\//i.test(s)) return esc(s);
  return esc(fallback);
}
// Phone numbers used in tel: / wa.me URLs. Strip everything except digits & +.
export function safePhone(v) {
  return String(v ?? "").replace(/[^\d+]/g, "");
}
// Numeric coerce with NaN guard for display.
export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ----- Rider card ----------------------------------------------------------
export function riderCard(r, { preferred = false } = {}) {
  const rating = num(r.rating, 0);
  const rounded = Math.round(rating);
  const stars = "★".repeat(rounded) + "☆".repeat(Math.max(0, 5 - rounded));
  const phone = safePhone(r.phone);
  const wa    = safePhone(r.whatsapp);
  const photo = safeImg(r.photo, "https://placehold.co/160x160/FFD000/111111?text=Y");
  const statusClass = ["online","available","busy","offline"].includes(r.status) ? r.status : "offline";

  return `
  <article class="rider-card fade-up" data-rider="${attr(r.id)}">
    <div class="flex items-start gap-4">
      <div class="relative shrink-0">
        <img src="${photo}" alt="${attr(r.name)}" class="w-16 h-16 rounded-full object-cover border border-gray-200" loading="lazy" referrerpolicy="no-referrer"/>
        <span class="status-dot status-${statusClass} absolute -bottom-0.5 -right-0.5 ring-2 ring-white"></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="font-display text-lg font-bold leading-tight truncate">${esc(r.name)}</h3>
          ${r.verified ? `<span class="badge badge-verified">✔ Verified</span>` : ""}
        </div>
        <div class="mt-1 text-xs text-gray-600 flex items-center gap-2 flex-wrap">
          <span class="capitalize">${esc(r.vehicle)}</span>
          <span>·</span>
          <span>${num(r.completed,0)} deliveries</span>
          <span>·</span>
          <span class="text-yellow-dark font-bold">${stars} ${rating.toFixed(1)}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${(Array.isArray(r.zones) ? r.zones : []).map(z => `<span class="badge badge-zone">${esc(z)}</span>`).join("")}
        </div>
      </div>
      <button class="fav-btn shrink-0 text-gray-400 hover:text-yellow-dark transition" data-rider="${attr(r.id)}" title="Save preferred" type="button" aria-label="${preferred ? 'Remove from preferred' : 'Save as preferred'}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${preferred ? "#FFD000" : "none"}" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 14c1.5-1.5 3-3.5 3-6a4 4 0 0 0-7-2.7A4 4 0 0 0 8 8c0 2.5 1.5 4.5 3 6l5 5z"/></svg>
      </button>
    </div>
    <div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 gap-3 flex-wrap">
      <div class="text-xs text-gray-600">
        <span class="font-bold text-brand-black">₱${num(r.base_fee,0)}</span> base
        ${num(r.per_km_fee,0) ? `· <span class="font-bold text-brand-black">₱${num(r.per_km_fee,0)}</span>/km` : ""}
      </div>
      <div class="flex gap-2">
        ${wa ? `<a href="https://wa.me/${attr(wa)}" target="_blank" rel="noopener noreferrer" class="btn-ghost" title="WhatsApp ${attr(r.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11 11 0 0 0 3.4 17.3L2 22l4.8-1.3A11 11 0 1 0 20.5 3.5zM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A8 8 0 1 1 12 20z"/></svg>
          WhatsApp
        </a>` : ""}
        ${phone ? `<a href="tel:${attr(phone)}" class="btn-primary" title="Call ${attr(r.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2.1z"/></svg>
          Call
        </a>` : ""}
      </div>
    </div>
  </article>`;
}

// ----- Empty state ---------------------------------------------------------
export function emptyState(title, sub) {
  return `<div class="text-center py-20 col-span-full"><div class="font-display text-2xl font-bold">${esc(title)}</div><p class="text-sm text-gray-600 mt-2">${esc(sub)}</p></div>`;
}

// ----- Toast ---------------------------------------------------------------
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; // textContent → safe by default
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

// ----- Modal ---------------------------------------------------------------
// IMPORTANT: callers should pass already-escaped HTML. If you have raw user
// input, wrap it through esc()/attr() before passing.
export function modal(html) {
  let back = document.querySelector(".modal-back");
  if (!back) {
    back = document.createElement("div");
    back.className = "modal-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    document.body.appendChild(back);
    back.addEventListener("click", e => { if (e.target === back) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  }
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.classList.add("show");
  // Focus the first focusable for keyboard users.
  const focusable = back.querySelector("input, select, textarea, button");
  if (focusable) setTimeout(() => focusable.focus(), 50);
  return back;
}
export function closeModal() {
  document.querySelector(".modal-back")?.classList.remove("show");
}
