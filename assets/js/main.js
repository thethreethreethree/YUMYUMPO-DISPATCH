// Global page hooks — runs on every page.
import "./drawer.js";     // auto-mounts any [data-drawer-target] hamburgers
import "./monitoring.js"; // lazy Sentry init when SENTRY_CONFIG.dsn is set

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

const obs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("fade-up");
      obs.unobserve(e.target);
    }
  }
}, { rootMargin: "0px 0px -10% 0px" });

document.querySelectorAll(".zone-card, .feature-card").forEach(el => obs.observe(el));
