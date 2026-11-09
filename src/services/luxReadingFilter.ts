/**
 * Stabilizes real ambient-light sensor readings for display without changing their calibration.
 * Raw lux remains available separately; this filter only reduces flicker/noise.
 */
export interface LightReadingSample {
  lux: number;
  timestamp: number;
}

export class LuxReadingFilter {
  private readonly samples: number[] = [];
  private filtered: number | null = null;

  constructor(private readonly windowSize = 5, private readonly alpha = 0.35) {
    if (!Number.isInteger(windowSize) || windowSize < 1) throw new Error('windowSize must be a positive integer.');
    if (!(alpha > 0 && alpha <= 1)) throw new Error('alpha must be greater than 0 and at most 1.');
  }

  push(value: number): number {
    if (!Number.isFinite(value) || value < 0) throw new Error('Lux reading must be a finite non-negative number.');
    this.samples.push(value);
    if (this.samples.length > this.windowSize) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    this.filtered = this.filtered === null ? median : this.filtered + this.alpha * (median - this.filtered);
    return this.filtered;
  }

  reset(): void {
    this.samples.length = 0;
    this.filtered = null;
  }
}
