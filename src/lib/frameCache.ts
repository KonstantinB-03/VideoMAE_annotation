/**
 * High-performance frame preloader and cache manager.
 * Implements sliding window preloading and strict memory management.
 */

export class FrameCacheManager {
  private cache: Map<number, HTMLImageElement> = new Map();
  private pending: Map<number, Promise<HTMLImageElement>> = new Map();
  private frameUrls: string[] = [];
  private maxCacheSize: number = 80;

  constructor(maxSize = 80) {
    this.maxCacheSize = maxSize;
  }

  /**
   * Set frame URLs for the current video.
   * Completely purges any previous video references to free browser RAM.
   */
  public setFrames(urls: string[]) {
    this.clear();
    this.frameUrls = urls;
  }

  /**
   * Forcibly purge all cached images and free memory.
   */
  public clear() {
    for (const img of this.cache.values()) {
      img.src = '';
      img.onload = null;
      img.onerror = null;
    }
    this.cache.clear();
    this.pending.clear();
    this.frameUrls = [];
  }

  /**
   * Get an image synchronously if cached, or undefined if not yet loaded.
   */
  public get(index: number): HTMLImageElement | undefined {
    return this.cache.get(index);
  }

  /**
   * Load a frame asynchronously.
   */
  public async load(index: number, fallbackUrl?: string): Promise<HTMLImageElement | null> {
    const url = this.frameUrls[index] || fallbackUrl;
    if (!url) return null;

    if (this.cache.has(index)) {
      return this.cache.get(index)!;
    }

    if (this.pending.has(index)) {
      return this.pending.get(index)!;
    }
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.cache.set(index, img);
        this.pending.delete(index);
        this.trim(index);
        resolve(img);
      };
      img.onerror = (e) => {
        this.pending.delete(index);
        reject(e);
      };
      img.src = url;
    });

    this.pending.set(index, promise);
    return promise;
  }

  /**
   * Preload a range around the current frame index.
   * (e.g. forward 25 frames, backward 10 frames)
   */
  public preloadWindow(currentIndex: number, forward = 25, backward = 10) {
    const total = this.frameUrls.length;
    if (total === 0) return;

    const start = Math.max(0, currentIndex - backward);
    const end = Math.min(total - 1, currentIndex + forward);

    // Prioritize forward playback order
    for (let i = currentIndex; i <= end; i++) {
      if (!this.cache.has(i) && !this.pending.has(i)) {
        this.load(i).catch(() => {});
      }
    }
    for (let i = currentIndex - 1; i >= start; i--) {
      if (!this.cache.has(i) && !this.pending.has(i)) {
        this.load(i).catch(() => {});
      }
    }
  }

  /**
   * Preload an explicit loop interval range.
   */
  public preloadInterval(startIdx: number, endIdx: number) {
    const total = this.frameUrls.length;
    const from = Math.max(0, startIdx);
    const to = Math.min(total - 1, endIdx);
    for (let i = from; i <= to; i++) {
      if (!this.cache.has(i) && !this.pending.has(i)) {
        this.load(i).catch(() => {});
      }
    }
  }

  /**
   * Evict distant frames to keep memory bounded.
   */
  private trim(centerIndex: number) {
    if (this.cache.size <= this.maxCacheSize) return;

    // Find entries furthest from center
    const entries = Array.from(this.cache.keys());
    entries.sort((a, b) => Math.abs(b - centerIndex) - Math.abs(a - centerIndex));

    const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
    for (const idx of toRemove) {
      const img = this.cache.get(idx);
      if (img) {
        img.src = '';
        img.onload = null;
        img.onerror = null;
      }
      this.cache.delete(idx);
    }
  }
}
