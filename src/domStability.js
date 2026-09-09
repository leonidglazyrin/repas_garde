// Centralise les MutationObserver historiques pour qu'aucun module ne puisse
// reconstruire l'interface pendant un défilement en cours ni entrer dans une
// cascade de rendus juste après une modification du DOM.
const NativeMutationObserver = window.MutationObserver;

let scrolling = false;
let scrollTimer = null;
const pendingObservers = new Set();
const SCROLL_IDLE_MS = 650;
const OBSERVER_COOLDOWN_MS = 160;

function flushAfterScroll() {
  scrolling = false;
  const queued = Array.from(pendingObservers);
  pendingObservers.clear();
  requestAnimationFrame(() => queued.forEach((observer) => observer.__schedule?.()));
}

function markScrolling() {
  scrolling = true;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(flushAfterScroll, SCROLL_IDLE_MS);
}

window.addEventListener("scroll", markScrolling, { passive: true, capture: true });
window.addEventListener("touchmove", markScrolling, { passive: true, capture: true });
window.addEventListener("wheel", markScrolling, { passive: true, capture: true });

if (NativeMutationObserver) {
  class StableMutationObserver {
    constructor(callback) {
      this.__callback = callback;
      this.__records = [];
      this.__scheduled = false;
      this.__lastFlush = 0;
      this.__cooldownTimer = null;
      this.__native = new NativeMutationObserver((records) => {
        this.__records.push(...records);
        if (scrolling) {
          pendingObservers.add(this);
          return;
        }
        this.__schedule();
      });
    }

    __schedule() {
      if (this.__scheduled || !this.__records.length) return;

      const elapsed = performance.now() - this.__lastFlush;
      if (elapsed < OBSERVER_COOLDOWN_MS) {
        clearTimeout(this.__cooldownTimer);
        this.__cooldownTimer = setTimeout(() => this.__schedule(), OBSERVER_COOLDOWN_MS - elapsed);
        return;
      }

      this.__scheduled = true;
      requestAnimationFrame(() => {
        this.__scheduled = false;
        if (scrolling) {
          pendingObservers.add(this);
          return;
        }
        this.__flush();
      });
    }

    __flush() {
      if (!this.__records.length || scrolling) return;
      const records = this.__records.splice(0);
      this.__lastFlush = performance.now();
      this.__callback(records, this.__native);

      // Si le callback a lui-même provoqué d'autres mutations, elles sont regroupées
      // et traitées plus tard au lieu de relancer une boucle visuelle immédiatement.
      if (this.__records.length) this.__schedule();
    }

    observe(target, options) {
      return this.__native.observe(target, options);
    }

    disconnect() {
      pendingObservers.delete(this);
      clearTimeout(this.__cooldownTimer);
      this.__records.length = 0;
      return this.__native.disconnect();
    }

    takeRecords() {
      return [...this.__records.splice(0), ...this.__native.takeRecords()];
    }
  }

  window.MutationObserver = StableMutationObserver;
}
