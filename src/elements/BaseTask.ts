import { Effect, pipe } from 'effect';

import {
  ConditionDoesNotExist,
  InvalidTaskStateTransition,
  TaskDoesNotExist,
} from '../errors.js';
import {
  JoinType,
  SplitType,
  TaskActionsService,
  TaskName,
  TaskState,
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

  getState() {
    const self = this;
    return Effect.gen(function* ($) {
      return yield* $(
        self.workflow.stateManager.getTaskState(self.workflow.id, self.name)
      );
    });
  }

  isEnabled() {
    return this.isStateEqualTo('enabled');
  }

  isFired() {
    return this.isStateEqualTo('fired');
  }

  isStateEqualTo(state: TaskState) {
    return pipe(
      this.getState(),
      Effect.map((s) => s === state)
    );
  }

  abstract enable(
    context: object
  ): Effect.Effect<
    TaskActionsService,
    TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
    unknown
  >;

  abstract disable(
    context: object
  ): Effect.Effect<
    never,
    TaskDoesNotExist | InvalidTaskStateTransition,
    unknown
  >;

  abstract fire(
    context: object,
    input?: unknown
  ): Effect.Effect<
    TaskActionsService,
    TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
    unknown
  >;

  abstract exit(
    context: object,
    input?: unknown
  ): Effect.Effect<
    TaskActionsService,
    TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
    unknown
  >;

  abstract cancel(
    context: object
  ): Effect.Effect<
    never,
    TaskDoesNotExist | InvalidTaskStateTransition,
    unknown
  >;

  cancelCancellationRegion(context: object) {
    const taskUpdates = Object.values(this.cancellationRegion.tasks).map((t) =>
      t.cancel(context)
    );
    const conditionUpdates = Object.values(
      this.cancellationRegion.conditions
    ).map((c) => c.cancel(context));

    return Effect.all(
      [
        Effect.all(taskUpdates, { batching: true, discard: true }),
        Effect.all(conditionUpdates, { batching: true, discard: true }),
      ],
      { discard: true }
    );
  }

  protected produceTokensInOutgoingFlows(context: object) {
    switch (this.splitType) {
      case 'or':
        return this.produceOrSplitTokensInOutgoingFlows(context);
      case 'xor':
        return this.produceXorSplitTokensInOutgoingFlows(context);
      default:
        return this.produceAndSplitTokensInOutgoingFlows();
    }
  }

  protected produceOrSplitTokensInOutgoingFlows(context: object) {
    const flows = this.outgoingFlows;
    const updates = Array.from(flows).map((flow) => {
      return Effect.gen(function* ($) {
        if (flow.isDefault) {
          yield* $(flow.nextElement.incrementMarking());
        } else if (
          flow.predicate ? yield* $(flow.predicate({ context })) : false
        ) {
          yield* $(flow.nextElement.incrementMarking());
        }
      });
    });
    return Effect.all(updates, { batching: true, discard: true });
  }

  protected produceXorSplitTokensInOutgoingFlows(context: object) {
    const flows = this.outgoingFlows;
    const sortedFlows = Array.from(flows).sort((flowA, flowB) => {
      return flowA.order > flowB.order ? 1 : flowA.order < flowB.order ? -1 : 0;
    });

    return Effect.gen(function* ($) {
      for (const flow of sortedFlows) {
        if (flow.isDefault) {
          return yield* $(flow.nextElement.incrementMarking());
        } else if (
          flow.predicate ? yield* $(flow.predicate({ context })) : false
        ) {
          return yield* $(flow.nextElement.incrementMarking());
        }
      }
    });
  }

  protected produceAndSplitTokensInOutgoingFlows() {
    const updates = Array.from(this.outgoingFlows).map((flow) => {
      return flow.nextElement.incrementMarking();
    });
    return Effect.all(updates, { batching: true, discard: true });
  }

  protected isJoinSatisfied() {
    switch (this.joinType) {
      case 'or':
        return this.isOrJoinSatisfied();
      case 'xor':
        return this.isXorJoinSatisfied();
      default:
        return this.isAndJoinSatisfied();
    }
  }

  protected isOrJoinSatisfied() {
    return this.workflow.isOrJoinSatisfied(this);
  }

  protected isXorJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.all(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          ),
          { batching: true }
        )
      );
      return markings.filter((m) => m > 0).length === 1 ? true : false;
    });
  }

  protected isAndJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.all(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          ),
          { batching: true }
        )
      );

      return markings.filter((m) => m > 0).length === markings.length
        ? true
        : false;
    });
  }

  protected enablePostTasks(context: object) {
    return Effect.all(
      Array.from(this.outgoingFlows).map((flow) =>
        flow.nextElement.enableTasks(context)
      ),
      { discard: true }
    );
  }
}
