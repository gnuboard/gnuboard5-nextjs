export function notifyCartChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cart:changed"));
}
