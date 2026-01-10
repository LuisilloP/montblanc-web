const DEFAULT_ROOT_MARGIN = "0px 0px -8% 0px";
const DEFAULT_THRESHOLD = 0.15;

type RevealOptions = {
  root: Element | null;
  rootMargin: string;
  threshold: number;
};

const prepareElement = (el: HTMLElement) => {
  el.classList.add("reveal-on-scroll");
  const delay = el.getAttribute("data-reveal-delay");
  if (delay) {
    el.style.setProperty("--reveal-delay", delay);
  }
};

const revealNow = (el: HTMLElement) => {
  prepareElement(el);
  el.classList.add("is-visible");
};

const clampThreshold = (value: string | null) => {
  if (!value) return DEFAULT_THRESHOLD;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_THRESHOLD;
  return Math.min(Math.max(parsed, 0), 1);
};

const resolveRoot = (el: HTMLElement): Element | null => {
  const selector = el.getAttribute("data-reveal-root");
  if (!selector) return null;
  const rootCandidate = document.querySelector(selector);
  return rootCandidate instanceof Element ? rootCandidate : null;
};

const observerCache = new Map<string, IntersectionObserver>();
let rootCounter = 0;

const getObserverKey = (options: RevealOptions) => {
  const rootKey =
    options.root && options.root instanceof HTMLElement
      ? options.root.dataset.revealRootId ??
        (options.root.dataset.revealRootId = `root-${++rootCounter}`)
      : "viewport";

  return `${rootKey}|${options.rootMargin}|${options.threshold}`;
};

const getObserver = (options: RevealOptions) => {
  const key = getObserverKey(options);
  const existing = observerCache.get(key);
  if (existing) return existing;

  const isInViewport = (el: HTMLElement) => {
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
          const target = entry.target as HTMLElement;
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

  const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
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
    const options: RevealOptions = {
      root: resolveRoot(el),
      rootMargin: el.getAttribute("data-reveal-root-margin") ?? DEFAULT_ROOT_MARGIN,
      threshold: clampThreshold(el.getAttribute("data-reveal-threshold")),
    };
    const observer = getObserver(options);
    observer.observe(el);
    if ((observer as IntersectionObserver & { isInViewport?: (el: HTMLElement) => boolean }).isInViewport?.(el)) {
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
