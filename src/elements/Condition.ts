import { Effect } from 'effect';

import { State } from '../State.js';
import { ConditionName, ConditionNode, WorkflowId } from '../types.js';
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

  incrementMarking(workflowId: WorkflowId) {
    const { name } = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      yield* $(stateManager.incrementConditionMarking(workflowId, name));
    });
  }

  decrementMarking(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      yield* $(stateManager.decrementConditionMarking(workflowId, self.name));
      yield* $(self.disableTasks(workflowId));
    });
  }

  enableTasks(workflowId: WorkflowId) {
    const tasks = Object.values(this.postSet);
    return Effect.all(
      tasks.map((task) => task.enable(workflowId)),
      { discard: true, batching: true }
    );
  }

  disableTasks(workflowId: WorkflowId) {
    const tasks = Object.values(this.postSet);
    return Effect.all(
      tasks.map((task) => task.disable(workflowId)),
      { discard: true, batching: true }
    );
  }

  cancelTasks(workflowId: WorkflowId) {
    const tasks = Object.values(this.postSet);
    return Effect.all(
      tasks.map((task) => task.cancel(workflowId)),
      { discard: true, batching: true }
    );
  }

  cancel(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      yield* $(stateManager.emptyConditionMarking(workflowId, self.name));
      yield* $(self.disableTasks(workflowId));
    });
  }

  getMarking(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const condition = yield* $(
        stateManager.getCondition(workflowId, self.name)
      );
      return condition.marking;
    });
  }
}
