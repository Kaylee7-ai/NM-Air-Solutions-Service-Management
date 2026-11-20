/* NM Air glow interactions — visual only; no booking or account logic */
(() => {
  const init = () => {
    const surfaces = document.querySelectorAll(".hero-art,.flow-art,.track-form,.contact-info");
    surfaces.forEach((el) => {
      el.classList.add("glow-surface");
      el.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch") return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--glow-x", ((event.clientX - rect.left) / rect.width * 100) + "%");
        el.style.setProperty("--glow-y", ((event.clientY - rect.top) / rect.height * 100) + "%");
      }, { passive: true });
    });

    document.querySelectorAll(".card,.metric,.panel,.schedule article").forEach((el) => el.classList.add("glow-card"));

    const revealItems = document.querySelectorAll(".strip > div,.section .heading,.section .card,.flow-copy,.track-copy,.track-form,.contact > div");
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealItems.forEach((el) => el.classList.add("glow-reveal"));
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealItems.forEach((el) => observer.observe(el));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
