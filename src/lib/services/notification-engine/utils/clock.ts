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
