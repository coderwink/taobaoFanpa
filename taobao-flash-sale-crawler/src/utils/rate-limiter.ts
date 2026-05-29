export class RateLimiter {
  private lastRequestTime: number = 0;
  private interval: number;

  constructor(interval: number) {
    if (interval < 0) {
      throw new Error(`interval must be non-negative, got ${interval}`);
    }
    this.interval = interval;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.interval) {
      const delay = this.interval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  setInterval(interval: number): void {
    if (interval < 0) {
      throw new Error(`interval must be non-negative, got ${interval}`);
    }
    this.interval = interval;
  }
}
