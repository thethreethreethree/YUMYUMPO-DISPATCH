// Reusable HTML component renderers (vanilla template literals).

export const statusLabel = {
  online: "Online",
  available: "Available",
  busy: "Busy",
  offline: "Offline",
};

export function riderCard(r, { preferred = false } = {}) {
  const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
  return `
  <article class="rider-card fade-up" data-rider="${r.id}">
    <div class="flex items-start gap-4">
      <div class="relative shrink-0">
        <img src="${r.photo}" alt="${r.name}" class="w-16 h-16 rounded-full object-cover border border-charcoal/10"/>
        <span class="status-dot status-${r.status} absolute -bottom-0.5 -right-0.5 ring-2 ring-cream"></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="font-display text-lg leading-tight truncate">${r.name}</h3>
          ${r.verified ? `<span class="badge badge-verified">✔ Verified</span>` : ""}
        </div>
        <div class="mt-1 text-xs text-charcoal/60 flex items-center gap-3 flex-wrap">
          <span class="capitalize">${r.vehicle}</span>
          <span>·</span>
          <span>${r.completed} deliveries</span>
          <span>·</span>
          <span class="text-ember">${stars} ${r.rating.toFixed(1)}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${r.zones.map(z => `<span class="badge badge-zone">${z}</span>`).join("")}
        </div>
      </div>
      <button class="fav-btn shrink-0 text-charcoal/40 hover:text-ember transition" data-rider="${r.id}" title="Save preferred">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${preferred ? "#E5631F" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.5-1.5 3-3.5 3-6a4 4 0 0 0-7-2.7A4 4 0 0 0 8 8c0 2.5 1.5 4.5 3 6l5 5z"/></svg>
      </button>
    </div>
    <div class="mt-4 flex items-center justify-between border-t border-charcoal/5 pt-4">
      <div class="text-xs text-charcoal/60">
        <span class="font-medium text-charcoal">₱${r.base_fee}</span> base
        ${r.per_km_fee ? `· <span class="font-medium text-charcoal">₱${r.per_km_fee}</span>/km` : ""}
      </div>
      <div class="flex gap-2">
        <a href="https://wa.me/${r.whatsapp}" target="_blank" class="btn-ghost" title="WhatsApp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11 11 0 0 0 3.4 17.3L2 22l4.8-1.3A11 11 0 1 0 20.5 3.5zM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A8 8 0 1 1 12 20z"/></svg>
          WhatsApp
        </a>
        <a href="tel:${r.phone}" class="btn-primary" title="Call">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2.1z"/></svg>
          Call
        </a>
      </div>
    </div>
  </article>`;
}

export function emptyState(title, sub) {
  return `<div class="text-center py-20"><div class="font-display text-2xl">${title}</div><p class="text-sm text-charcoal/60 mt-2">${sub}</p></div>`;
}

export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

export function modal(html) {
  let back = document.querySelector(".modal-back");
  if (!back) {
    back = document.createElement("div");
    back.className = "modal-back";
    document.body.appendChild(back);
    back.addEventListener("click", e => { if (e.target === back) back.classList.remove("show"); });
  }
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.classList.add("show");
  return back;
}
export function closeModal() {
  document.querySelector(".modal-back")?.classList.remove("show");
}
