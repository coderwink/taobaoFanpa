export class RateLimiter {
  private lastRequestTime: number = 0;
  private interval: number;

  constructor(interval: number) {
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
    this.interval = interval;
  }
}
