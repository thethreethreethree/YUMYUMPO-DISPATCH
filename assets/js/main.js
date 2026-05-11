// Lightweight global page hooks (scroll fade-in, year, etc.)
const obs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("fade-up");
      obs.unobserve(e.target);
    }
  }
}, { rootMargin: "0px 0px -10% 0px" });

document.querySelectorAll(".zone-card, .step-card").forEach(el => obs.observe(el));
