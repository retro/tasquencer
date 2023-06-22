import * as Effect from '@effect/io/Effect';

import { ConditionNode } from '../types.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Task } from './Task.js';
import { Workflow } from './Workflow.js';

export class Condition {
  readonly incomingFlows = new Set<TaskToConditionFlow>();
  readonly outgoingFlows = new Set<ConditionToTaskFlow>();
  readonly preSet: Record<string, Task> = {};
  readonly postSet: Record<string, Task> = {};
  readonly id: string;
  readonly name: string;
  readonly isImplicit: boolean = false;
  readonly workflow: Workflow;

  constructor(
    id: string,
    name: string,
    conditionNode: ConditionNode,
    workflow: Workflow
  ) {
    this.id = id;
    this.name = name;
    this.isImplicit = conditionNode.isImplicit ?? false;
    this.workflow = workflow;
  }

  addIncomingFlow(flow: TaskToConditionFlow) {
    this.incomingFlows.add(flow);
    this.preSet[flow.priorElement.name] = flow.priorElement;
  }

  addOutgoingFlow(flow: ConditionToTaskFlow) {
    this.outgoingFlows.add(flow);
    this.postSet[flow.nextElement.name] = flow.nextElement;
  }

  incrementMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.workflow.stateManager.incrementConditionMarking(self));
      yield* $(self.enableTasks());
    });
  }

  decrementMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.workflow.stateManager.decrementConditionMarking(self));
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
      yield* $(self.workflow.stateManager.emptyConditionMarking(self));
      yield* $(self.cancelTasks());
    });
  }

  getMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      return yield* $(self.workflow.stateManager.getConditionMarking(self));
    });
  }
}
