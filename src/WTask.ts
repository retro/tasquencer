import { dual, identity, pipe } from '@effect/data/Function';
import * as HashSet from '@effect/data/HashSet';
import * as Effect from '@effect/io/Effect';

import { WCondition } from './WCondition.js';
import { WNet } from './WNet.js';
import { StateManager } from './state-manager/types.js';
import type { Flow, JoinType, SplitType, Task } from './types.js';

export type WTaskState =
  | 'disabled'
  | 'enabled'
  | 'activated'
  | 'completed'
  | 'cancelled';

const VALID_STATE_TRANSITIONS = {
  disabled: new Set(['enabled']),
  enabled: new Set(['activated', 'disabled']),
  activated: new Set(['completed', 'cancelled']),
  completed: new Set(['enabled']),
  cancelled: new Set(['enabled']),
};

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

  getState(): WTaskState {
    const state = Effect.runSync(this.stateManager.getState());
    if (HashSet.has(state.activeTasks, this.name)) {
      return 'activated';
    } else if (HashSet.has(state.enabledTasks, this.name)) {
      return 'enabled';
    }
    return 'disabled';
  }

  enable() {
    const validTransitions = VALID_STATE_TRANSITIONS[this.getState()];
    const self = this;

    return Effect.gen(function* ($) {
      if (validTransitions.has('enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied());
        if (isJoinSatisfied) {
          yield* $(self.stateManager.enableTask(self.name));
        }
      }
    });
  }

  disable() {
    const validTransitions = VALID_STATE_TRANSITIONS[this.getState()];
    if (validTransitions.has('disabled')) {
      return this.stateManager.disableTask(this.name);
    }
    return Effect.unit();
  }

  activate() {
    const validTransitions = VALID_STATE_TRANSITIONS[this.getState()];
    if (validTransitions.has('activated')) {
      return pipe(
        Effect.succeed(this),
        Effect.tap((task) => task.stateManager.disableTask(task.name)),
        Effect.tap((task) => task.stateManager.activateTask(task.name)),
        Effect.tap((task) => {
          const preSet = Object.values(task.preSet);
          const updates = preSet.map((condition) =>
            condition.decrementMarking()
          );
          return Effect.allParDiscard(updates);
        })
      );
    }
    return Effect.unit();
  }

  complete() {
    const validTransitions = VALID_STATE_TRANSITIONS[this.getState()];
    if (validTransitions.has('completed')) {
      return pipe(
        Effect.succeed(this),
        Effect.tap((task) => task.stateManager.deactivateTask(task.name)),
        Effect.tap((task) => task.cancelCancellationRegion()),
        Effect.tap((task) => task.produceTokensInOutgoingFlows())
      );
    }
    return Effect.unit();
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

  cancel() {
    const validTransitions = VALID_STATE_TRANSITIONS[this.getState()];
    if (validTransitions.has('cancelled')) {
      return this.stateManager.deactivateTask(this.name);
    }
    return Effect.unit();
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
