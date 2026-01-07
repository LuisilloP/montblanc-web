const initReveal = () => {
  const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (!elements.length) return;

  const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduce) {
    elements.forEach((el) => el.classList.add("reveal-on-scroll", "is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const target = entry.target as HTMLElement;
          target.classList.add("is-visible");
          observer.unobserve(target);
        }
      });
    },
    { threshold: 0.16 }
  );

  elements.forEach((el) => {
    el.classList.add("reveal-on-scroll");
    const delay = el.getAttribute("data-reveal-delay");
    if (delay) {
      el.style.setProperty("--reveal-delay", delay);
    }
    observer.observe(el);
  });
};

if (document.readyState === "complete" || document.readyState === "interactive") {
  initReveal();
} else {
  document.addEventListener("DOMContentLoaded", initReveal, { once: true });
}
