/** Registra el service worker (solo en la versión publicada) para poder instalar la app en el móvil. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* sin service worker la app funciona igual, solo no se puede instalar */
    });
  });
}
