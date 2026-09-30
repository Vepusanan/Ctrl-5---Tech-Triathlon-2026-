import { describe, expect, it } from 'vitest';
import {
  IllegalTransitionError,
  loadingStateMachine,
  loadingStatusSchema,
  orderStateMachine,
  orderStatusSchema,
  type StateMachine,
  stopStateMachine,
  stopStatusSchema,
  syncStateMachine,
  syncStatusSchema,
  tripStateMachine,
  tripStatusSchema,
} from '../src/index.ts';

function walk<S extends string>(machine: StateMachine<S>, path: readonly S[]) {
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    if (from === undefined || to === undefined) throw new Error('Path index out of range');
    machine.assertTransition(from, to);
  }
}

const machines = [
  { name: 'order', machine: orderStateMachine, states: orderStatusSchema.options },
  { name: 'trip', machine: tripStateMachine, states: tripStatusSchema.options },
  { name: 'stop', machine: stopStateMachine, states: stopStatusSchema.options },
  { name: 'loading', machine: loadingStateMachine, states: loadingStatusSchema.options },
  { name: 'sync event', machine: syncStateMachine, states: syncStatusSchema.options },
] as const;

describe.each(machines)('$name state machine', ({ machine, states }) => {
  it('defines transitions for exactly the shared status enum', () => {
    expect(Object.keys(machine.transitions).sort()).toEqual([...states].sort());
  });

  it('only targets known states and never loops to itself', () => {
    for (const [from, targets] of Object.entries<readonly string[]>(machine.transitions)) {
      for (const to of targets) {
        expect(states).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });
});

describe('order transitions', () => {
  it('follows the served path from draft to receipt confirmed', () => {
    expect(() =>
      walk(orderStateMachine, [
        'draft',
        'submitted',
        'confirmed',
        'allocated',
        'loading',
        'dispatched',
        'delivered',
        'receipt_confirmed',
      ]),
    ).not.toThrow();
  });

  it('lets a deferred order be allocated in a later run', () => {
    expect(() => walk(orderStateMachine, ['confirmed', 'deferred', 'allocated'])).not.toThrow();
  });

  it('records a failed delivery after dispatch', () => {
    expect(orderStateMachine.canTransition('dispatched', 'failed')).toBe(true);
  });

  it('allows cancellation only before the cutoff lock', () => {
    expect(orderStateMachine.canTransition('draft', 'cancelled')).toBe(true);
    expect(orderStateMachine.canTransition('submitted', 'cancelled')).toBe(true);
    expect(orderStateMachine.canTransition('confirmed', 'cancelled')).toBe(false);
    expect(orderStateMachine.canTransition('allocated', 'cancelled')).toBe(false);
  });

  it.each([
    ['draft', 'confirmed'],
    ['submitted', 'allocated'],
    ['confirmed', 'loading'],
    ['allocated', 'dispatched'],
    ['dispatched', 'receipt_confirmed'],
    ['failed', 'receipt_confirmed'],
    ['receipt_confirmed', 'draft'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(orderStateMachine.canTransition(from, to)).toBe(false);
  });

  it('treats receipt confirmed, failed and cancelled as terminal', () => {
    expect(orderStateMachine.isTerminal('receipt_confirmed')).toBe(true);
    expect(orderStateMachine.isTerminal('failed')).toBe(true);
    expect(orderStateMachine.isTerminal('cancelled')).toBe(true);
    expect(orderStateMachine.isTerminal('deferred')).toBe(false);
  });
});

describe('trip transitions', () => {
  it('follows planned to completed', () => {
    expect(() =>
      walk(tripStateMachine, ['planned', 'published', 'loading', 'ready', 'departed', 'completed']),
    ).not.toThrow();
  });

  it('can block a trip before departure when its vehicle becomes unavailable', () => {
    for (const from of ['planned', 'published', 'loading', 'ready'] as const) {
      expect(tripStateMachine.canTransition(from, 'blocked')).toBe(true);
    }
  });

  it.each([
    ['planned', 'loading'],
    ['published', 'departed'],
    ['loading', 'departed'],
    ['departed', 'blocked'],
    ['completed', 'planned'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(tripStateMachine.canTransition(from, to)).toBe(false);
  });
});

describe('stop transitions', () => {
  it('records arrival before an outcome', () => {
    expect(() => walk(stopStateMachine, ['pending', 'arrived', 'delivered'])).not.toThrow();
    expect(() => walk(stopStateMachine, ['pending', 'arrived', 'failed'])).not.toThrow();
  });

  it.each([
    ['pending', 'delivered'],
    ['pending', 'failed'],
    ['delivered', 'failed'],
    ['failed', 'delivered'],
    ['delivered', 'pending'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(stopStateMachine.canTransition(from, to)).toBe(false);
  });
});

describe('loading transitions', () => {
  it('returns to in progress after an acknowledged exception, then becomes ready', () => {
    expect(() =>
      walk(loadingStateMachine, [
        'not_started',
        'in_progress',
        'exception',
        'in_progress',
        'ready',
        'departed',
      ]),
    ).not.toThrow();
  });

  it.each([
    ['not_started', 'ready'],
    ['exception', 'ready'],
    ['exception', 'departed'],
    ['in_progress', 'departed'],
    ['departed', 'in_progress'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(loadingStateMachine.canTransition(from, to)).toBe(false);
  });
});

describe('sync event transitions', () => {
  it('moves from local to synced', () => {
    expect(() => walk(syncStateMachine, ['local', 'queued', 'syncing', 'synced'])).not.toThrow();
  });

  it('re-queues after a failed network call and can end in conflict', () => {
    expect(() =>
      walk(syncStateMachine, ['local', 'queued', 'syncing', 'queued', 'syncing', 'conflict']),
    ).not.toThrow();
  });

  it.each([
    ['local', 'synced'],
    ['queued', 'synced'],
    ['synced', 'queued'],
    ['conflict', 'synced'],
    ['conflict', 'queued'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(syncStateMachine.canTransition(from, to)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('throws an IllegalTransitionError describing the move', () => {
    let caught: unknown;
    try {
      stopStateMachine.assertTransition('pending', 'delivered');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IllegalTransitionError);
    expect(caught).toMatchObject({ entity: 'stop', from: 'pending', to: 'delivered' });
    expect((caught as Error).message).toBe('Illegal stop transition: pending -> delivered');
  });

  it('lists the next allowed states', () => {
    expect(orderStateMachine.nextStates('confirmed')).toEqual(['allocated', 'deferred']);
  });
});
