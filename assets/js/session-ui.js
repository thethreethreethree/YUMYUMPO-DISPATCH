// Tiny helper to render "signed in as / sign out" markup in nav slots.
import { getCurrentProfile, signOut, onAuthChange } from "./auth.js";

export async function renderSessionBadge(slot, { signedOutHref = "./auth.html" } = {}) {
  if (!slot) return;
  const me = await getCurrentProfile();
  if (!me) {
    slot.innerHTML = `<a href="${signedOutHref}" class="text-sm font-semibold text-gray-600 hover:text-brand-black">Sign in</a>`;
    return;
  }
  const name = me.profile?.name || "Account";
  slot.innerHTML = `
    <div class="session-pop">
      <button class="session-trigger" type="button">
        <span class="session-dot">${name.charAt(0).toUpperCase()}</span>
        <span class="session-name">${name}</span>
      </button>
      <div class="session-menu" hidden>
        <a class="session-link" href="${me.role === 'rider' ? './rider-dashboard.html' : me.role === 'admin' ? './admin.html' : './restaurants.html'}">Dashboard</a>
        <button class="session-link" id="signOutBtn">Sign out</button>
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
