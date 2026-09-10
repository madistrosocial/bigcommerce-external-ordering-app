// PWA standalone mode (and some mobile browsers) render `100dvh` unreliably —
// it can be miscalculated or fail to update on rotation/resize, leaving a
// grey/white gap at the bottom of the screen. To work around this, we track
// the real visible height in JS and expose it as a CSS custom property that
// layouts can use instead of `100dvh`.
export function initViewportHeightVar() {
  const setAppHeight = () => {
    const isStandalonePwa =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const height = isStandalonePwa
      ? window.innerHeight
      : (window.visualViewport?.height ?? window.innerHeight);
    document.documentElement.style.setProperty("--app-height", `${height}px`);
  };

  setAppHeight();

  window.addEventListener("resize", setAppHeight);
  window.addEventListener("orientationchange", setAppHeight);
  window.visualViewport?.addEventListener("resize", setAppHeight);

  return () => {
    window.removeEventListener("resize", setAppHeight);
    window.removeEventListener("orientationchange", setAppHeight);
    window.visualViewport?.removeEventListener("resize", setAppHeight);
  };
}
