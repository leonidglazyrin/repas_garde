// Centralise les MutationObserver des modules historiques pour éviter les rafales
// de recalculs qui faisaient "grésiller" la page pendant le défilement.
const NativeMutationObserver = window.MutationObserver;

let scrolling = false;
let scrollTimer = null;
const pendingObservers = new Set();

function markScrolling() {
  scrolling = true;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    scrolling = false;
    const queued = Array.from(pendingObservers);
    pendingObservers.clear();
    queued.forEach((observer) => observer.__flush?.());
  }, 180);
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
      this.__native = new NativeMutationObserver((records, nativeObserver) => {
        this.__records.push(...records);
        if (scrolling) {
          pendingObservers.add(this);
          return;
        }
        this.__schedule(nativeObserver);
      });
    }

    __schedule(nativeObserver = this.__native) {
      if (this.__scheduled) return;
      this.__scheduled = true;
      requestAnimationFrame(() => {
        this.__scheduled = false;
        if (scrolling) {
          pendingObservers.add(this);
          return;
        }
        this.__flush(nativeObserver);
      });
    }

    __flush(nativeObserver = this.__native) {
      if (!this.__records.length) return;
      const records = this.__records.splice(0);
      this.__callback(records, nativeObserver);
    }

    observe(target, options) {
      return this.__native.observe(target, options);
    }

    disconnect() {
      pendingObservers.delete(this);
      this.__records.length = 0;
      return this.__native.disconnect();
    }

    takeRecords() {
      return [...this.__records.splice(0), ...this.__native.takeRecords()];
    }
  }

  window.MutationObserver = StableMutationObserver;
}
