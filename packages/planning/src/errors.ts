import type { Violation } from '@waypoint/shared';

export class PlanningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningInputError';
  }
}

/** The validator rejected a plan. `violations` is the complete list, not the first failure. */
export class InfeasiblePlanError extends Error {
  readonly violations: readonly Violation[];

  constructor(violations: readonly Violation[]) {
    const summary = violations.map((item) => `${item.rule}: ${item.detail}`).join('; ');
    super(`Allocator produced an infeasible plan: ${summary}`);
    this.name = 'InfeasiblePlanError';
    this.violations = violations;
  }
}
