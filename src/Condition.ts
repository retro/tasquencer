import * as Effect from '@effect/io/Effect';

import { Task } from './Task.js';
import { Workflow } from './Workflow.js';
import { StateManager } from './stateManager/types.js';
import { ConditionNode } from './types.js';

export class Condition {
  readonly stateManager: StateManager;
  readonly workflow: Workflow;
  readonly preSet: Record<string, Task> = {};
  readonly postSet: Record<string, Task> = {};

  readonly name: string;

  constructor(
    stateManager: StateManager,
    workflow: Workflow,
    condition: ConditionNode
  ) {
    this.stateManager = stateManager;
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
      yield* $(self.stateManager.incrementConditionMarking(self));
      yield* $(self.enableTasks());
    });
  }

  decrementMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.stateManager.decrementConditionMarking(self));
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
      yield* $(self.stateManager.emptyConditionMarking(self));
      yield* $(self.cancelTasks());
    });
  }

  getMarking() {
    return this.stateManager.getConditionMarking(this);
  }
}
