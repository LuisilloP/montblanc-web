const header = document.querySelector<HTMLElement>("[data-header]");
const menuButton = document.querySelector<HTMLButtonElement>("[data-menu-button]");
const mobileOverlay = document.querySelector<HTMLElement>("[data-mobile-overlay]");
const mobilePanel = document.querySelector<HTMLElement>("[data-mobile-panel]");
const closeButton = document.querySelector<HTMLButtonElement>("[data-menu-close]");
const navLinks = mobileOverlay?.querySelectorAll<HTMLAnchorElement>("a");

const closeMenu = (): void => {
  mobileOverlay?.classList.remove("is-open");
  mobileOverlay?.setAttribute("aria-hidden", "true");
  menuButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("overflow-hidden", "mobile-menu-open");
};

const openMenu = (): void => {
  mobileOverlay?.classList.add("is-open");
  mobileOverlay?.setAttribute("aria-hidden", "false");
  menuButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("overflow-hidden", "mobile-menu-open");
  mobilePanel?.focus({ preventScroll: true });
};

const toggleMenu = (): void => {
  const isOpen = mobileOverlay?.classList.contains("is-open");
  if (isOpen) {
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
  }
};

const handleResize = (): void => {
  if (window.innerWidth >= 768) {
    closeMenu();
  }
};

const handleScroll = (): void => {
  const threshold = 16;
  if (window.scrollY > threshold) {
    header?.classList.add("is-scrolled");
  } else {
    header?.classList.remove("is-scrolled");
  }
};

menuButton?.addEventListener("click", toggleMenu);
mobileOverlay?.addEventListener("click", handleOverlayClick);
closeButton?.addEventListener("click", closeMenu);
navLinks?.forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", handleKeydown);
window.addEventListener("resize", handleResize);
window.addEventListener("scroll", handleScroll, { passive: true });
handleScroll();
