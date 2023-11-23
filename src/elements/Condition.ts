import { Effect } from 'effect';

import { ConditionName, ConditionNode } from '../types.js';
import { BaseTask } from './BaseTask.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Workflow } from './Workflow.js';

export class Condition {
  readonly incomingFlows = new Set<TaskToConditionFlow>();
  readonly outgoingFlows = new Set<ConditionToTaskFlow>();
  readonly preSet: Record<string, BaseTask> = {};
  readonly postSet: Record<string, BaseTask> = {};
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
        self.workflow.stateManager.incrementConditionMarking(
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
        self.workflow.stateManager.decrementConditionMarking(
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
        self.workflow.stateManager.emptyConditionMarking(
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
        self.workflow.stateManager.getCondition(self.workflow.id, self.name)
      );
      return condition.marking;
    });
  }
}
