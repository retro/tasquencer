import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import {
  ConditionDoesNotExist,
  ConditionDoesNotExistInStore,
  EndConditionDoesNotExist,
  InvalidTaskState,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExist,
  TaskDoesNotExistInStore,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ExecutionContext,
  JoinType,
  SplitType,
  TaskName,
  TaskState,
  WorkflowId,
} from '../types.js';
import { Condition } from './Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is exited and prev condition(s)
// have positive marking, so it should transition to enabled again

export abstract class BaseTask {
  readonly workflow: Workflow;
  readonly preSet: Record<string, Condition> = {};
  readonly postSet: Record<string, Condition> = {};
  readonly incomingFlows = new Set<ConditionToTaskFlow>();
  readonly outgoingFlows = new Set<TaskToConditionFlow>();
  readonly cancellationRegion: {
    tasks: Record<string, BaseTask>;
    conditions: Record<string, Condition>;
  } = { tasks: {}, conditions: {} };
  readonly name: TaskName;
  readonly splitType: SplitType | undefined;
  readonly joinType: JoinType | undefined;

  constructor(
    name: string,
    workflow: Workflow,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    this.name = TaskName(name);
    this.workflow = workflow;
    this.splitType = props?.splitType;
    this.joinType = props?.joinType;
  }
  addIncomingFlow(flow: ConditionToTaskFlow) {
    this.incomingFlows.add(flow);
    this.preSet[flow.priorElement.name] = flow.priorElement;
  }
  addOutgoingFlow(flow: TaskToConditionFlow) {
    this.outgoingFlows.add(flow);
    this.postSet[flow.nextElement.name] = flow.nextElement;
  }
  addTaskToCancellationRegion(task: BaseTask) {
    this.cancellationRegion.tasks[task.name] = task;
  }
  addConditionToCancellationRegion(condition: Condition) {
    this.cancellationRegion.conditions[condition.name] = condition;
  }

  getPresetElements() {
    return new Set(Object.values(this.preSet));
  }

  getPostsetElements() {
    return new Set(Object.values(this.postSet));
  }

  getRemoveSet() {
    return new Set([
      ...Object.values(this.cancellationRegion.tasks),
      ...Object.values(this.cancellationRegion.conditions),
    ]);
  }

  getTask(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getTask(workflowId, self.name));
    });
  }

  getTaskState(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getTaskState(workflowId, self.name));
    });
  }

  isEnabled(workflowId: WorkflowId) {
    return this.isStateEqualTo(workflowId, 'enabled');
  }

  isFired(workflowId: WorkflowId) {
    return this.isStateEqualTo(workflowId, 'fired');
  }

  isStateEqualTo(workflowId: WorkflowId, state: TaskState) {
    return pipe(
      this.getTaskState(workflowId),
      Effect.map((s) => s === state)
    );
  }

  abstract enable(
    workflowId: WorkflowId
  ): Effect.Effect<
    ExecutionContext | State,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    unknown
  >;

  abstract disable(
    workflowId: WorkflowId
  ): Effect.Effect<
    ExecutionContext | State,
    TaskDoesNotExist | TaskDoesNotExistInStore | InvalidTaskStateTransition,
    unknown
  >;

  abstract fire(
    workflowId: WorkflowId,
    input?: unknown
  ): Effect.Effect<
    ExecutionContext | State,
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist
    | InvalidTaskStateTransition
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | WorkflowDoesNotExist,
    unknown
  >;

  abstract exit(
    workflowId: WorkflowId,
    input?: unknown
  ): Effect.Effect<
    ExecutionContext | State,
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist
    | InvalidTaskStateTransition
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | WorkflowDoesNotExist,
    unknown
  >;

  abstract cancel(
    workflowId: WorkflowId
  ): Effect.Effect<
    ExecutionContext | State,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskState
    | WorkflowDoesNotExist
    | WorkItemDoesNotExist
    | EndConditionDoesNotExist
    | InvalidTaskStateTransition
    | InvalidWorkflowStateTransition
    | InvalidWorkItemTransition,
    unknown
  >;

  abstract maybeExit(
    workflowId: WorkflowId
  ): Effect.Effect<
    State | ExecutionContext,
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist
    | InvalidTaskStateTransition
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | WorkflowDoesNotExist,
    void
  >;

  maybeCancelOrDisable(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const taskState = yield* $(
        stateManager.getTaskState(workflowId, self.name)
      );
      if (taskState === 'fired') {
        return yield* $(self.cancel(workflowId));
      } else if (taskState === 'enabled') {
        return yield* $(self.disable(workflowId));
      }
    });
  }

  cancelCancellationRegion(workflowId: WorkflowId) {
    const taskUpdates = Object.values(this.cancellationRegion.tasks).map((t) =>
      t.cancel(workflowId)
    );
    const conditionUpdates = Object.values(
      this.cancellationRegion.conditions
    ).map((c) => c.cancel(workflowId));

    return Effect.all(
      [
        Effect.allSuccesses(taskUpdates, { batching: true }),
        Effect.all(conditionUpdates, { batching: true, discard: true }),
      ],
      { discard: true }
    );
  }

  protected produceTokensInOutgoingFlows(workflowId: WorkflowId) {
    switch (this.splitType) {
      case 'or':
        return this.produceOrSplitTokensInOutgoingFlows(workflowId);
      case 'xor':
        return this.produceXorSplitTokensInOutgoingFlows(workflowId);
      default:
        return this.produceAndSplitTokensInOutgoingFlows(workflowId);
    }
  }

  protected produceOrSplitTokensInOutgoingFlows(workflowId: WorkflowId) {
    const self = this;

    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const context = yield* $(stateManager.getWorkflowContext(workflowId)); // TODO: Load context from store
      const flows = self.outgoingFlows;

      const updates = Array.from(flows).map((flow) => {
        return Effect.gen(function* ($) {
          if (flow.isDefault) {
            yield* $(flow.nextElement.incrementMarking(workflowId));
          } else if (
            flow.predicate ? yield* $(flow.predicate({ context })) : false
          ) {
            yield* $(flow.nextElement.incrementMarking(workflowId));
          }
        });
      });

      return yield* $(Effect.all(updates, { batching: true, discard: true }));
    });
  }

  protected produceXorSplitTokensInOutgoingFlows(workflowId: WorkflowId) {
    const self = this;

    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const context = yield* $(stateManager.getWorkflowContext(workflowId)); // TODO: Load context from store
      const flows = self.outgoingFlows;
      const sortedFlows = Array.from(flows).sort((flowA, flowB) => {
        return flowA.order > flowB.order
          ? 1
          : flowA.order < flowB.order
          ? -1
          : 0;
      });
      for (const flow of sortedFlows) {
        if (flow.isDefault) {
          return yield* $(flow.nextElement.incrementMarking(workflowId));
        } else if (
          flow.predicate ? yield* $(flow.predicate({ context })) : false
        ) {
          return yield* $(flow.nextElement.incrementMarking(workflowId));
        }
      }
    });
  }

  protected produceAndSplitTokensInOutgoingFlows(workflowId: WorkflowId) {
    const updates = Array.from(this.outgoingFlows).map((flow) => {
      return flow.nextElement.incrementMarking(workflowId);
    });
    return Effect.all(updates, { batching: true, discard: true });
  }

  protected isJoinSatisfied(workflowId: WorkflowId) {
    switch (this.joinType) {
      case 'or':
        return this.isOrJoinSatisfied(workflowId);
      case 'xor':
        return this.isXorJoinSatisfied(workflowId);
      default:
        return this.isAndJoinSatisfied(workflowId);
    }
  }

  protected isOrJoinSatisfied(workflowId: WorkflowId) {
    return this.workflow.isOrJoinSatisfied(workflowId, this);
  }

  protected isXorJoinSatisfied(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.all(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking(workflowId)
          ),
          { batching: true }
        )
      );
      return markings.filter((m) => m > 0).length === 1 ? true : false;
    });
  }

  protected isAndJoinSatisfied(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.all(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking(workflowId)
          ),
          { batching: true }
        )
      );

      return markings.filter((m) => m > 0).length === markings.length
        ? true
        : false;
    });
  }

  protected enablePostTasks(workflowId: WorkflowId) {
    return Effect.allSuccesses(
      Array.from(this.outgoingFlows).map((flow) =>
        flow.nextElement.enableTasks(workflowId)
      )
    );
  }
}
