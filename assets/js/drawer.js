// Drawer primitive — open/close any slide-out panel with proper ESC, scrim
// click, body scroll lock, and focus management. Used by the public-page
// mobile nav AND the dashboard sidebar on phones.

let activePanel = null;
let activeTrigger = null;
let scrim = null;

function ensureScrim() {
  if (scrim) return scrim;
  scrim = document.createElement("div");
  scrim.className = "drawer-back";
  scrim.addEventListener("click", close);
  document.body.appendChild(scrim);
  return scrim;
}

function open(panel, trigger) {
  if (activePanel) close();
  ensureScrim();
  activePanel = panel;
  activeTrigger = trigger || null;
  panel.classList.add("show");
  scrim.classList.add("show");
  document.body.classList.add("drawer-open");
  trigger?.setAttribute("aria-expanded", "true");

  // Any nav link inside the drawer closes it on click — both external links
  // (which navigate away anyway) and in-page anchors (tab switchers in the
  // dashboard sidebar). Skip elements opted out via [data-drawer-keep-open].
  if (!panel._linkBound) {
    panel.addEventListener("click", (e) => {
      const a = e.target.closest("a, [data-tab]");
      if (a && !a.hasAttribute("data-drawer-keep-open")) close();
    });
    panel._linkBound = true;
  }

  // Move focus into the panel for keyboard users.
  const firstFocusable = panel.querySelector("a, button, input, [tabindex]:not([tabindex='-1'])");
  setTimeout(() => firstFocusable?.focus(), 80);
}

export function close() {
  if (!activePanel) return;
  activePanel.classList.remove("show");
  scrim?.classList.remove("show");
  document.body.classList.remove("drawer-open");
  activeTrigger?.setAttribute("aria-expanded", "false");
  activeTrigger?.focus();
  activePanel = null;
  activeTrigger = null;
}

// Global keyboard handler for ESC.
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && activePanel) close();
});

// Wire any element with [data-drawer-target="#selector"] to toggle its target.
// Optional [data-drawer-close] inside the panel closes it.
export function mountDrawerTriggers(root = document) {
  root.querySelectorAll("[data-drawer-target]").forEach(trigger => {
    if (trigger.dataset.drawerBound) return;
    trigger.dataset.drawerBound = "1";
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      const panel = document.querySelector(trigger.dataset.drawerTarget);
      if (!panel) return;
      if (panel === activePanel) close(); else open(panel, trigger);
    });
  });
  root.querySelectorAll("[data-drawer-close]").forEach(el => {
    if (el.dataset.drawerBound) return;
    el.dataset.drawerBound = "1";
    el.addEventListener("click", close);
  });
}

// Auto-mount on import. Pages can call mountDrawerTriggers() again after
// injecting more triggers dynamically.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountDrawerTriggers());
} else {
  mountDrawerTriggers();
}
