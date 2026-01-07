const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const mobileOverlay = document.querySelector("[data-mobile-overlay]");
const mobilePanel = document.querySelector("[data-mobile-panel]");
const closeButton = document.querySelector("[data-menu-close]");
const navLinks = mobileOverlay?.querySelectorAll("a");

const closeMenu = () => {
  mobileOverlay?.classList.remove("is-open");
  mobileOverlay?.setAttribute("aria-hidden", "true");
  menuButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("overflow-hidden", "mobile-menu-open");
};

const openMenu = () => {
  mobileOverlay?.classList.add("is-open");
  mobileOverlay?.setAttribute("aria-hidden", "false");
  menuButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("overflow-hidden", "mobile-menu-open");
  mobilePanel?.focus({ preventScroll: true });
};

const toggleMenu = () => {
  const isOpen = mobileOverlay?.classList.contains("is-open");
  if (isOpen) {
    closeMenu();
  } else {
    openMenu();
  }
};

const handleOverlayClick = (event) => {
  const target = event.target;
  if (target?.hasAttribute?.("data-overlay-backdrop")) {
    closeMenu();
  }
};

const handleKeydown = (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
};

const handleResize = () => {
  if (window.innerWidth >= 768) {
    closeMenu();
  }
};

const handleScroll = () => {
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
