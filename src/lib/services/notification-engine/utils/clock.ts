/**
 * Thin abstraction over `Date.now()`. Not business logic — just lets
 * time-dependent code (job factories, future retry-scheduling logic) depend
 * on an injectable interface instead of a hard-coded `new Date()`, which is
 * what actually makes that later logic unit-testable without waiting on a
 * real clock (Dependency Inversion Principle).
 */
export interface IClock {
  now(): Date;
}

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}

/**
 * Phase 9 addition (additive — no existing export changed). Lets a caller
 * schedule a job for a future `nextAttemptAt` (`NotificationService.raiseEvent`'s
 * `scheduledAt` option) by reusing the same `IClock` seam `NotificationJobFactory`
 * already reads `nextAttemptAt` from, instead of adding a bespoke "scheduledAt"
 * field/parameter to the factory or queue engine.
 */
export class FixedClock implements IClock {
  constructor(private readonly fixedDate: Date) {}

  now(): Date {
    return this.fixedDate;
  }
}
