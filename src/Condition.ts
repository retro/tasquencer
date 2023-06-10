import * as Effect from '@effect/io/Effect';

import { Task } from './Task.js';
import { Workflow } from './Workflow.js';
import { StateManager } from './stateManager/types.js';
import { ConditionNode } from './types.js';

export class Condition {
  readonly workflow: Workflow;
  readonly preSet: Record<string, Task> = {};
  readonly postSet: Record<string, Task> = {};

  readonly name: string;

  constructor(workflow: Workflow, condition: ConditionNode) {
    this.workflow = workflow;
    this.name = condition.name;
  }

  addIncomingFlow(task: Task) {
    this.preSet[task.name] = task;
  }

  addOutgoingFlow(task: Task) {
    this.postSet[task.name] = task;
  }

  incrementMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(StateManager);
      yield* $(stateManager.incrementConditionMarking(self));
      yield* $(self.enableTasks());
    });
  }

  decrementMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(StateManager);
      yield* $(stateManager.decrementConditionMarking(self));
      yield* $(self.disableTasks());
    });
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
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(StateManager);
      yield* $(stateManager.emptyConditionMarking(self));
      yield* $(self.cancelTasks());
    });
  }

  getMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(StateManager);
      return yield* $(stateManager.getConditionMarking(self));
    });
  }
}
