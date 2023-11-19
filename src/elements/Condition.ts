import { Effect } from 'effect';

import { ConditionName } from '../state/types.js';
import { ConditionNode } from '../types.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Task } from './Task.js';
import { Workflow } from './Workflow.js';

export class Condition {
  readonly incomingFlows = new Set<TaskToConditionFlow>();
  readonly outgoingFlows = new Set<ConditionToTaskFlow>();
  readonly preSet: Record<string, Task> = {};
  readonly postSet: Record<string, Task> = {};
  readonly name: ConditionName;
  readonly isImplicit: boolean = false;
  readonly workflow: Workflow;

  constructor(name: string, conditionNode: ConditionNode, workflow: Workflow) {
    this.name = ConditionName(name);
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

  getPresetElements() {
    return new Set(Object.values(this.preSet));
  }

  getPostsetElements() {
    return new Set(Object.values(this.postSet));
  }

  incrementMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(
        self.workflow.stateManager.incrementWorkflowConditionMarking(
          self.workflow.id,
          self.name
        )
      );
    });
  }

  decrementMarking(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(
        self.workflow.stateManager.decrementWorkflowConditionMarking(
          self.workflow.id,
          self.name
        )
      );
      yield* $(self.disableTasks(context));
    });
  }

  enableTasks(context: object) {
    const tasks = Object.values(this.postSet);
    return Effect.all(
      tasks.map((task) => task.enable(context)),
      { discard: true, batching: true }
    );
  }

  disableTasks(context: object) {
    const tasks = Object.values(this.postSet);
    return Effect.all(
      tasks.map((task) => task.disable(context)),
      { discard: true, batching: true }
    );
  }

  cancelTasks(context: object) {
    const tasks = Object.values(this.postSet);
    return Effect.all(
      tasks.map((task) => task.cancel(context)),
      { discard: true, batching: true }
    );
  }

  cancel(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(
        self.workflow.stateManager.emptyWorkflowConditionMarking(
          self.workflow.id,
          self.name
        )
      );
      yield* $(self.disableTasks(context));
    });
  }

  getMarking() {
    const self = this;
    return Effect.gen(function* ($) {
      const condition = yield* $(
        self.workflow.stateManager.getWorkflowCondition(
          self.workflow.id,
          self.name
        )
      );
      return condition.marking;
    });
  }
}
