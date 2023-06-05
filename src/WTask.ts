import { dual, identity, pipe } from '@effect/data/Function';
import * as HashSet from '@effect/data/HashSet';
import * as Effect from '@effect/io/Effect';

import { WCondition } from './WCondition.js';
import { WNet } from './WNet.js';
import { StateManager } from './state-manager/types.js';
import type { Flow, JoinType, SplitType, Task, WTaskState } from './types.js';

const VALID_STATE_TRANSITIONS = {
  disabled: new Set(['enabled']),
  enabled: new Set(['active', 'disabled']),
  active: new Set(['completed', 'cancelled']),
  completed: new Set(['enabled']),
  cancelled: new Set(['enabled']),
};

function isValidTransition(
  from: WTaskState,
  to: WTaskState
): to is keyof typeof VALID_STATE_TRANSITIONS {
  return VALID_STATE_TRANSITIONS[from].has(to);
}

export class WTask {
  readonly stateManager: StateManager;
  readonly net: WNet;
  readonly preSet: Record<string, WCondition> = {};
  readonly postSet: Record<string, WCondition> = {};
  readonly incomingFlows: Record<string, Flow> = {};
  readonly outgoingFlows: Record<string, Flow> = {};
  readonly cancellationRegion: {
    tasks: Record<string, WTask>;
    conditions: Record<string, WCondition>;
  } = { tasks: {}, conditions: {} };
  readonly name: string;
  readonly splitType: SplitType | undefined;
  readonly joinType: JoinType | undefined;

  constructor(stateManager: StateManager, net: WNet, task: Task) {
    this.stateManager = stateManager;
    this.net = net;
    this.name = task.name;
    this.splitType = task.splitType;
    this.joinType = task.joinType;
  }
  addIncomingFlow(condition: WCondition) {
    this.preSet[condition.name] = condition;
  }
  addOutgoingFlow(condition: WCondition, flow: Flow) {
    this.postSet[condition.name] = condition;
    this.outgoingFlows[condition.name] = flow;
  }
  addTaskToCancellationRegion(task: WTask) {
    this.cancellationRegion.tasks[task.name] = task;
  }
  addConditionToCancellationRegion(condition: WCondition) {
    this.cancellationRegion.conditions[condition.name] = condition;
  }

  getState() {
    return this.stateManager.getTaskState(this.name);
  }

  enable() {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied());
        if (isJoinSatisfied) {
          yield* $(self.stateManager.enableTask(self.name));
        }
      }
    });
  }

  disable() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'disabled')) {
        yield* $(self.stateManager.disableTask(self.name));
      }
    });
  }

  activate() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'active')) {
        yield* $(self.stateManager.activateTask(self.name));

        const preSet = Object.values(self.preSet);
        const updates = preSet.map((condition) => condition.decrementMarking());
        yield* $(Effect.allParDiscard(updates));
      }
    });
  }

  complete() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'completed')) {
        yield* $(self.stateManager.completeTask(self.name));
        yield* $(self.cancelCancellationRegion());
        yield* $(self.produceTokensInOutgoingFlows());
      }
    });
  }

  cancel() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'cancelled')) {
        yield* $(self.stateManager.cancelTask(self.name));
      }
    });
  }

  cancelCancellationRegion() {
    const taskUpdates = Object.values(this.cancellationRegion.tasks).map((t) =>
      t.cancel()
    );
    const conditionUpdates = Object.values(
      this.cancellationRegion.conditions
    ).map((c) => c.cancel());

    return Effect.allParDiscard([...taskUpdates, ...conditionUpdates]);
  }

  private produceTokensInOutgoingFlows() {
    switch (this.splitType) {
      case 'or':
        return this.produceOrSplitTokensInOutgoingFlows();
      case 'xor':
        return this.produceXorSplitTokensInOutgoingFlows();
      default:
        return this.produceAndSplitTokensInOutgoingFlows();
    }
  }

  private produceOrSplitTokensInOutgoingFlows() {
    const flows = this.outgoingFlows;
    const updates = Object.entries(flows).map(([condition, flow]) => {
      if (flow.isDefault) {
        return this.postSet[condition].incrementMarking();
      } else if (flow.predicate ? flow.predicate(null, this.net.net) : false) {
        return this.postSet[condition].incrementMarking();
      }
      return Effect.unit();
    });
    return Effect.allParDiscard(updates);
  }

  private produceXorSplitTokensInOutgoingFlows() {
    const flows = this.outgoingFlows;
    const sortedFlows = Object.entries(flows).sort(([, flowA], [, flowB]) => {
      const a = flowA.order ?? Infinity;
      const b = flowB.order ?? Infinity;
      return a > b ? 1 : a < b ? -1 : 0;
    });

    for (const [condition, flow] of sortedFlows) {
      if (flow.isDefault) {
        return this.postSet[condition].incrementMarking();
      } else if (flow.predicate ? flow.predicate(null, this.net.net) : false) {
        return this.postSet[condition].incrementMarking();
      }
    }
    return Effect.unit();
  }

  private produceAndSplitTokensInOutgoingFlows() {
    const updates = Object.entries(this.outgoingFlows).map(([condition]) => {
      return this.postSet[condition].incrementMarking();
    });
    return Effect.allParDiscard(updates);
  }

  private isJoinSatisfied() {
    switch (this.joinType) {
      case 'or':
        return this.isOrJoinSatisfied();
      case 'xor':
        return this.isXorJoinSatisfied();
      default:
        return this.isAndJoinSatisfied();
    }
  }

  private isOrJoinSatisfied() {
    return Effect.succeed(false);
  }

  private isXorJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.allPar(Object.values(self.preSet).map((c) => c.getMarking()))
      );
      return markings.filter((m) => m > 0).length === 1 ? true : false;
    });
  }

  private isAndJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.allPar(Object.values(self.preSet).map((c) => c.getMarking()))
      );

      return markings.filter((m) => m > 0).length === markings.length
        ? true
        : false;
    });
  }
}
