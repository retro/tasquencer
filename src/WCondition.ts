import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import { WNet } from './WNet.js';
import { WTask } from './WTask.js';
import { StateManager } from './state-manager/types.js';
import type { Condition } from './types.js';

export class WCondition {
  readonly stateManager: StateManager;
  readonly net: WNet;
  readonly preSet: Record<string, WTask> = {};
  readonly postSet: Record<string, WTask> = {};

  readonly name: string;

  constructor(stateManager: StateManager, net: WNet, condition: Condition) {
    this.stateManager = stateManager;
    this.net = net;
    this.name = condition.name;
  }

  addIncomingFlow(task: WTask) {
    this.preSet[task.name] = task;
  }

  addOutgoingFlow(task: WTask) {
    this.postSet[task.name] = task;
  }

  incrementMarking() {
    return pipe(
      Effect.succeed(this),
      Effect.tap((condition) =>
        condition.stateManager.incrementConditionMarking(condition.name)
      ),
      Effect.tap((condition) => condition.enableTasks())
    );
  }

  decrementMarking() {
    return pipe(
      Effect.succeed(this),
      Effect.tap((condition) =>
        condition.stateManager.decrementConditionMarking(condition.name)
      ),
      Effect.tap((condition) => condition.disableTasks())
    );
  }

  enableTasks() {
    const tasks = Object.values(this.postSet);
    return Effect.allParDiscard(tasks.map((task) => task.enable()));
  }

  disableTasks() {
    const tasks = Object.values(this.postSet);
    return Effect.allParDiscard(tasks.map((task) => task.disable()));
  }

  cancelTasks() {
    const tasks = Object.values(this.postSet);
    return Effect.allParDiscard(tasks.map((task) => task.cancel()));
  }

  cancel() {
    return pipe(
      Effect.succeed(this),
      Effect.tap((condition) =>
        condition.stateManager.emptyConditionMarking(condition.name)
      ),
      Effect.tap((condition) => condition.cancelTasks())
    );
  }

  getMarking() {
    return this.stateManager.getConditionMarking(this.name);
  }
}
