// Tiny helper to render "signed in as / sign out" markup in nav slots.
import { getCurrentProfile, signOut, onAuthChange } from "./auth.js";
import { esc, attr } from "./components.js";

export async function renderSessionBadge(slot, { signedOutHref = "./auth.html" } = {}) {
  if (!slot) return;
  const me = await getCurrentProfile();
  if (!me) {
    slot.innerHTML = `<a href="${attr(signedOutHref)}" class="text-sm font-semibold text-gray-600 hover:text-brand-black">Sign in</a>`;
    return;
  }
  const name = String(me.profile?.name || "Account");
  const initial = (name.trim().charAt(0) || "Y").toUpperCase();
  const dashHref = me.role === "rider" ? "./rider-dashboard.html"
                 : me.role === "admin" ? "./admin.html"
                 : "./restaurants.html";
  slot.innerHTML = `
    <div class="session-pop">
      <button class="session-trigger" type="button" aria-haspopup="true">
        <span class="session-dot">${esc(initial)}</span>
        <span class="session-name">${esc(name)}</span>
      </button>
      <div class="session-menu" hidden>
        <a class="session-link" href="${attr(dashHref)}">Dashboard</a>
        <button class="session-link" id="signOutBtn" type="button">Sign out</button>
      </div>
    </div>
  `;
  const trig = slot.querySelector(".session-trigger");
  const menu = slot.querySelector(".session-menu");
  trig.addEventListener("click", () => menu.hidden = !menu.hidden);
  document.addEventListener("click", e => { if (!slot.contains(e.target)) menu.hidden = true; });
  slot.querySelector("#signOutBtn").addEventListener("click", signOut);
}

export function bindAuthRefresh(slot, opts) {
  return onAuthChange(() => renderSessionBadge(slot, opts));
}
