export class LruNonceSet {
  private readonly max: number;
  private readonly set = new Set<string>();

  constructor(max = 100) {
    this.max = max;
  }

  has(nonce: string): boolean {
    return this.set.has(nonce);
  }

  add(nonce: string): void {
    if (this.set.has(nonce)) {
      this.set.delete(nonce);
    } else if (this.set.size >= this.max) {
      const oldest = this.set.values().next().value as string | undefined;
      if (oldest !== undefined) this.set.delete(oldest);
    }
    this.set.add(nonce);
  }

  get size(): number {
    return this.set.size;
  }
}
