const DEFAULT_ROOT_MARGIN = "0px 0px -8% 0px";
const DEFAULT_THRESHOLD = 0.15;

const prepareElement = (el) => {
  el.classList.add("reveal-on-scroll");
  const delay = el.getAttribute("data-reveal-delay");
  if (delay) {
    el.style.setProperty("--reveal-delay", delay);
  }
};

const revealNow = (el) => {
  prepareElement(el);
  el.classList.add("is-visible");
};

const clampThreshold = (value) => {
  if (!value) return DEFAULT_THRESHOLD;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_THRESHOLD;
  return Math.min(Math.max(parsed, 0), 1);
};

const resolveRoot = (el) => {
  const selector = el.getAttribute("data-reveal-root");
  if (!selector) return null;
  const rootCandidate = document.querySelector(selector);
  return rootCandidate instanceof Element ? rootCandidate : null;
};

const observerCache = new Map();
let rootCounter = 0;

const getObserverKey = (options) => {
  const rootKey =
    options.root instanceof HTMLElement
      ? options.root.dataset.revealRootId ||
        (options.root.dataset.revealRootId = `root-${++rootCounter}`)
      : "viewport";

  return `${rootKey}|${options.rootMargin}|${options.threshold}`;
};

const getObserver = (options) => {
  const key = getObserverKey(options);
  const existing = observerCache.get(key);
  if (existing) return existing;

  const isInViewport = (el) => {
    const rect = el.getBoundingClientRect();
    const rootRect =
      options.root instanceof Element
        ? options.root.getBoundingClientRect()
        : {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
          };
    return rect.bottom > rootRect.top && rect.top < rootRect.bottom;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const target = entry.target;
          target.classList.add("is-visible");
          observer.unobserve(target);
        }
      });
    },
    {
      root: options.root,
      rootMargin: options.rootMargin,
      threshold: options.threshold,
    }
  );

  observerCache.set(key, observer);
  return Object.assign(observer, { isInViewport });
};

const initReveal = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const elements = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!elements.length) return;

  const rootElement = document.documentElement;
  const prefersReduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsObserver = "IntersectionObserver" in window;

  if (prefersReduce || !supportsObserver) {
    elements.forEach(revealNow);
    rootElement.classList.add("has-reveal");
    return;
  }

  elements.forEach((el) => {
    prepareElement(el);
    const options = {
      root: resolveRoot(el),
      rootMargin: el.getAttribute("data-reveal-root-margin") || DEFAULT_ROOT_MARGIN,
      threshold: clampThreshold(el.getAttribute("data-reveal-threshold")),
    };
    const observer = getObserver(options);
    observer.observe(el);
    if (observer.isInViewport?.(el)) {
      requestAnimationFrame(() => {
        el.classList.add("is-visible");
        observer.unobserve(el);
      });
    }
  });

  rootElement.classList.add("has-reveal");
};

if (document.readyState === "complete" || document.readyState === "interactive") {
  initReveal();
} else {
  document.addEventListener("DOMContentLoaded", initReveal, { once: true });
}
