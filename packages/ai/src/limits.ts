/**
 * Limites de débit en mémoire (par process). Elles se réinitialisent au redémarrage,
 * ce qui est acceptable : le plafond quotidien, lui, est persisté en base.
 */

const MAX_TRACKED_KEYS = 10_000;

/** Cooldown par clé (utilisateur, ou portée globale sur Twitch). */
export class CooldownTracker {
  private readonly startedAt = new Map<string, number>();
  private readonly notifiedFor = new Map<string, number>();

  isActive(key: string, cooldownMs: number, now: number): boolean {
    const start = this.startedAt.get(key);
    return start !== undefined && now - start < cooldownMs;
  }

  start(key: string, now: number): void {
    this.startedAt.set(key, now);
    if (this.startedAt.size > MAX_TRACKED_KEYS) this.prune(now);
  }

  /** Vrai une seule fois par période de cooldown (pour ne poser qu'une réaction ⏳). */
  claimNotification(key: string): boolean {
    const start = this.startedAt.get(key);
    if (start === undefined || this.notifiedFor.get(key) === start) return false;
    this.notifiedFor.set(key, start);
    return true;
  }

  private prune(now: number): void {
    for (const [key, start] of this.startedAt) {
      if (now - start > 3_600_000) {
        this.startedAt.delete(key);
        this.notifiedFor.delete(key);
      }
    }
  }
}

/** Nombre maximal d'événements sur une fenêtre glissante (ex. réponses par minute et par salon). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly notifiedAt = new Map<string, number>();

  constructor(private readonly windowMs = 60_000) {}

  isLimited(key: string, max: number, now: number): boolean {
    return this.recent(key, now).length >= max;
  }

  hit(key: string, now: number): void {
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > MAX_TRACKED_KEYS) this.prune(now);
  }

  /** Vrai au plus une fois par fenêtre (pour ne poser qu'une réaction ⏳). */
  claimNotification(key: string, now: number): boolean {
    const last = this.notifiedAt.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    this.notifiedAt.set(key, now);
    return true;
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
  }

  private prune(now: number): void {
    for (const [key, list] of this.hits) {
      if (list.every((at) => now - at >= this.windowMs)) {
        this.hits.delete(key);
        this.notifiedAt.delete(key);
      }
    }
  }
}

export const BUSY = Symbol("ellie-busy");

/**
 * File d'attente simple : au plus `max` appels simultanés. Au-delà, les appels attendent leur tour
 * pendant `queueTimeoutMs` au maximum, puis sont abandonnés silencieusement (`BUSY`).
 */
export class ConcurrencyLimiter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly max = 3,
    private readonly queueTimeoutMs = 30_000,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T | typeof BUSY> {
    if (!(await this.acquire())) return BUSY;
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<boolean> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const grant = () => {
        clearTimeout(timer);
        this.running++;
        resolve(true);
      };
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(grant);
        if (index !== -1) this.waiting.splice(index, 1);
        resolve(false);
      }, this.queueTimeoutMs);
      timer.unref?.();
      this.waiting.push(grant);
    });
  }

  private release(): void {
    this.running--;
    this.waiting.shift()?.();
  }
}
