/**
 * Pure time-aggregation logic for per-domain focus time.
 *
 * The background service worker feeds focus-change events into a single
 * TimeAggregator. The aggregator maintains one open session per domain,
 * then folds closed sessions into per-domain buckets that are flushed
 * to the agent on a fixed cadence.
 *
 * This module is deliberately side-effect free so the logic can be
 * exhaustively unit-tested without spinning up a browser.
 */

import type { DomainBucket, TimeReport } from "../types.js";

interface OpenSession {
  readonly domain: string;
  readonly startedAt: number;
}

interface MutableBucket {
  domain: string;
  focusMs: number;
  sessionCount: number;
  firstObservedAt: number;
  lastObservedAt: number;
}

export class TimeAggregator {
  private openSession: OpenSession | null = null;
  private readonly buckets = new Map<string, MutableBucket>();
  private windowStart: number;

  constructor(now: number) {
    this.windowStart = now;
  }

  /**
   * Record a focus transition.
   *
   * `domain` should be the registrable domain (empty string is allowed
   * and means "no active tab", which closes any open session).
   */
  recordFocusChange(domain: string, visible: boolean, now: number): void {
    if (this.openSession && (!visible || this.openSession.domain !== domain)) {
      this.closeSession(now);
    }
    if (visible && domain.length > 0 && !this.openSession) {
      this.openSession = { domain, startedAt: now };
    }
  }

  /**
   * Close the current session and return the in-memory bucket snapshot.
   * `now` is used to close any still-open session so flushes capture
   * in-flight focus time.
   */
  flush(deviceId: string, now: number): TimeReport {
    if (this.openSession) {
      const reopenDomain = this.openSession.domain;
      this.closeSession(now);
      this.openSession = { domain: reopenDomain, startedAt: now };
    }

    const domains: DomainBucket[] = Array.from(this.buckets.values()).map(
      (b) => ({
        domain: b.domain,
        focusMs: b.focusMs,
        sessionCount: b.sessionCount,
        firstObservedAt: new Date(b.firstObservedAt).toISOString(),
        lastObservedAt: new Date(b.lastObservedAt).toISOString(),
      }),
    );

    const report: TimeReport = {
      deviceId,
      generatedAt: new Date(now).toISOString(),
      windowStart: new Date(this.windowStart).toISOString(),
      windowEnd: new Date(now).toISOString(),
      domains,
    };

    this.buckets.clear();
    this.windowStart = now;
    return report;
  }

  /** Used by tests to introspect state without flushing. */
  snapshot(): readonly DomainBucket[] {
    return Array.from(this.buckets.values()).map((b) => ({
      domain: b.domain,
      focusMs: b.focusMs,
      sessionCount: b.sessionCount,
      firstObservedAt: new Date(b.firstObservedAt).toISOString(),
      lastObservedAt: new Date(b.lastObservedAt).toISOString(),
    }));
  }

  private closeSession(now: number): void {
    if (!this.openSession) {
      return;
    }
    const elapsed = Math.max(0, now - this.openSession.startedAt);
    if (elapsed === 0) {
      this.openSession = null;
      return;
    }
    const existing = this.buckets.get(this.openSession.domain);
    if (existing) {
      existing.focusMs += elapsed;
      existing.sessionCount += 1;
      existing.lastObservedAt = now;
    } else {
      this.buckets.set(this.openSession.domain, {
        domain: this.openSession.domain,
        focusMs: elapsed,
        sessionCount: 1,
        firstObservedAt: this.openSession.startedAt,
        lastObservedAt: now,
      });
    }
    this.openSession = null;
  }
}

/**
 * Extract a registrable domain from a URL string. Returns an empty
 * string for about:, chrome://, extension:, or unparseable URLs —
 * those should not contribute to focus time.
 */
export function registrableDomain(url: string): string {
  const parsed = safeParse(url);
  if (!parsed) {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    return "";
  }
  return host;
}

function safeParse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
