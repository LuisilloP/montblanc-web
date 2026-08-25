const header = document.querySelector<HTMLElement>("[data-header]");
const menuButton = document.querySelector<HTMLButtonElement>("[data-menu-button]");
const mobileOverlay = document.querySelector<HTMLElement>("[data-mobile-overlay]");
const mobilePanel = document.querySelector<HTMLElement>("[data-mobile-panel]");
const closeButton = document.querySelector<HTMLButtonElement>("[data-menu-close]");
const navLinks = mobileOverlay?.querySelectorAll<HTMLAnchorElement>("a");

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

const getFocusable = (): HTMLElement[] =>
  mobilePanel
    ? Array.from(mobilePanel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      )
    : [];

const isOpen = (): boolean => Boolean(mobileOverlay?.classList.contains("is-open"));

const closeMenu = (options: { restoreFocus?: boolean } = {}): void => {
  const wasOpen = isOpen();
  mobileOverlay?.classList.remove("is-open");
  mobileOverlay?.setAttribute("aria-hidden", "true");
  menuButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("overflow-hidden", "mobile-menu-open");
  if (wasOpen && options.restoreFocus !== false) {
    menuButton?.focus({ preventScroll: true });
  }
};

const openMenu = (): void => {
  mobileOverlay?.classList.add("is-open");
  mobileOverlay?.setAttribute("aria-hidden", "false");
  menuButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("overflow-hidden", "mobile-menu-open");
  const focusable = getFocusable();
  (focusable[0] ?? mobilePanel)?.focus({ preventScroll: true });
};

const toggleMenu = (): void => {
  if (isOpen()) {
    closeMenu();
  } else {
    openMenu();
  }
};

const handleOverlayClick = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null;
  if (target?.hasAttribute?.("data-overlay-backdrop")) {
    closeMenu();
  }
};

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === "Escape") {
    closeMenu();
    return;
  }

  // El panel se anuncia como diálogo modal, así que el foco no debe escaparse
  // a la página de detrás mientras está abierto.
  if (event.key !== "Tab" || !isOpen()) return;

  const focusable = getFocusable();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (event.shiftKey && (active === first || !mobilePanel?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

const handleResize = (): void => {
  // Debe coincidir con el breakpoint `lg` en el que aparece el menú de escritorio
  if (window.innerWidth >= 1024) {
    closeMenu({ restoreFocus: false });
  }
};

let scrollTicking = false;

const handleScroll = (): void => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    scrollTicking = false;
    if (window.scrollY > 16) {
      header?.classList.add("is-scrolled");
    } else {
      header?.classList.remove("is-scrolled");
    }
  });
};

/** Marca en el menú la sección que se está viendo. */
const setupScrollSpy = (): void => {
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-header] a[href^="#"]')
  ).filter((link) => (link.getAttribute("href") ?? "#") !== "#");

  if (!links.length) return;

  // El menú de escritorio y el móvil apuntan a las mismas secciones, así que se
  // agrupa por id: si no, el estado activo acabaría en un enlace oculto.
  const sections: { id: string; el: HTMLElement }[] = [];
  const seen = new Set<string>();

  links.forEach((link) => {
    const id = link.getAttribute("href")!.slice(1);
    if (seen.has(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    seen.add(id);
    sections.push({ id, el });
  });

  if (!sections.length) return;

  sections.sort((a, b) => a.el.offsetTop - b.el.offsetTop);

  let spyTicking = false;

  // Criterio geométrico: la última sección cuyo borde superior ya pasó la línea
  // de lectura. Comparar por proporción visible haría ganar siempre a las
  // secciones largas sobre las cortas.
  const update = () => {
    const remValue =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--header-offset")
      ) || 6.5;
    const line = remValue * 16 + 24;

    let activeId = "";
    sections.forEach(({ id, el }) => {
      if (el.getBoundingClientRect().top <= line) activeId = id;
    });

    // Al final del documento gana siempre la última sección
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
      activeId = sections[sections.length - 1].id;
    }

    links.forEach((link) => {
      const active = link.getAttribute("href") === `#${activeId}`;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const schedule = () => {
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(() => {
      spyTicking = false;
      update();
    });
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
};

menuButton?.addEventListener("click", toggleMenu);
mobileOverlay?.addEventListener("click", handleOverlayClick);
closeButton?.addEventListener("click", () => closeMenu());
navLinks?.forEach((link) => link.addEventListener("click", () => closeMenu({ restoreFocus: false })));
document.addEventListener("keydown", handleKeydown);
window.addEventListener("resize", handleResize);
window.addEventListener("scroll", handleScroll, { passive: true });
handleScroll();
setupScrollSpy();
