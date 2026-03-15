export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}
