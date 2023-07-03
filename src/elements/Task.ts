import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import { TaskActivities } from '../builder/TaskBuilder.js';
import {
  JoinType,
  SplitType,
  TaskActionsService,
  TaskState,
} from '../types.js';
import { Condition } from './Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Workflow } from './Workflow.js';

const VALID_STATE_TRANSITIONS = {
  disabled: new Set(['enabled']),
  enabled: new Set(['active', 'disabled']),
  active: new Set(['completed', 'canceled']),
  completed: new Set(['enabled']),
  canceled: new Set(['enabled']),
};

function isValidTransition(
  from: TaskState,
  to: TaskState
): to is keyof typeof VALID_STATE_TRANSITIONS {
  return VALID_STATE_TRANSITIONS[from].has(to);
}

export class Task {
  readonly workflow: Workflow;
  readonly preSet: Record<string, Condition> = {};
  readonly postSet: Record<string, Condition> = {};
  readonly incomingFlows = new Set<ConditionToTaskFlow>();
  readonly outgoingFlows = new Set<TaskToConditionFlow>();
  readonly cancellationRegion: {
    tasks: Record<string, Task>;
    conditions: Record<string, Condition>;
  } = { tasks: {}, conditions: {} };
  readonly id: string;
  readonly name: string;
  readonly activities: TaskActivities;
  readonly splitType: SplitType | undefined;
  readonly joinType: JoinType | undefined;

  constructor(
    id: string,
    name: string,
    workflow: Workflow,
    activities: TaskActivities,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    this.id = id;
    this.name = name;
    this.workflow = workflow;
    this.activities = activities;
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
  addTaskToCancellationRegion(task: Task) {
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
      return yield* $(self.workflow.stateManager.getTaskState(self));
    });
  }

  getActivityContext() {
    return {
      getTaskId: () => Effect.succeed(this.id),
      getTaskName: () => Effect.succeed(this.name),
      getWorkflowId: () => Effect.succeed(this.workflow.id),
      getTaskState: () => Effect.succeed(this.getState()),
    };
  }

  enable(context: object) {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());

      if (isValidTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied());
        if (isJoinSatisfied) {
          const activityContext = self.getActivityContext();
          const taskActionsService = yield* $(TaskActionsService);
          const activateTask = (input?: unknown) => {
            return taskActionsService.activateTask(self.name, input);
          };

          const beforeResult = yield* $(
            self.activities.onEnable.callbacks.before({
              ...activityContext,
              activateTask,
              context,
              input: undefined,
            })
          );
          yield* $(self.workflow.stateManager.enableTask(self));
          const result = yield* $(
            self.activities.onEnable.callbacks.procedure({
              ...activityContext,
              activateTask,
              context,
              input: beforeResult,
            })
          );
          yield* $(
            self.activities.onEnable.callbacks.after({
              ...activityContext,
              activateTask,
              context,
              input: result,
            })
          );
        }
      }
    });
  }

  disable(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'disabled')) {
        const activityContext = self.getActivityContext();
        const beforeResult = yield* $(
          self.activities.onDisable.callbacks.before({
            ...activityContext,
            context,
            input: undefined,
          })
        );
        yield* $(self.workflow.stateManager.disableTask(self));
        const result = yield* $(
          self.activities.onDisable.callbacks.procedure({
            ...activityContext,
            context,
            input: beforeResult,
          })
        );
        yield* $(
          self.activities.onDisable.callbacks.after({
            ...activityContext,
            context,
            input: result,
          })
        );
      }
    });
  }

  activate(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'active')) {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);
        const completeTask = (input?: unknown) => {
          return taskActionsService.completeTask(self.name, input);
        };

        const beforeResult = yield* $(
          self.activities.onActivate.callbacks.before({
            ...activityContext,
            completeTask,
            context,
            input,
          })
        );

        yield* $(self.workflow.stateManager.activateTask(self));

        const result = yield* $(
          self.activities.onActivate.callbacks.procedure({
            ...activityContext,
            completeTask,
            context,
            input: beforeResult,
          })
        );

        const preSet = Object.values(self.preSet);
        const updates = preSet.map((condition) =>
          condition.decrementMarking(context)
        );
        yield* $(Effect.allParDiscard(updates));

        return yield* $(
          self.activities.onActivate.callbacks.after({
            ...activityContext,
            completeTask,
            context,
            input: result,
          })
        );
      }
    });
  }

  complete(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'completed')) {
        const activityContext = self.getActivityContext();

        const beforeResult = yield* $(
          self.activities.onComplete.callbacks.before({
            ...activityContext,
            context,
            input,
          })
        );

        yield* $(self.workflow.stateManager.completeTask(self));

        const result = yield* $(
          self.activities.onComplete.callbacks.procedure({
            ...activityContext,
            context,
            input: beforeResult,
          })
        );

        yield* $(self.cancelCancellationRegion(context));
        yield* $(self.produceTokensInOutgoingFlows(context));

        return yield* $(
          self.activities.onComplete.callbacks.after({
            ...activityContext,
            context,
            input: result,
          })
        );
      }
    });
  }

  cancel(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'canceled')) {
        const activityContext = self.getActivityContext();
        const beforeResult = yield* $(
          self.activities.onCancel.callbacks.before({
            ...activityContext,
            context,
            input: undefined,
          })
        );
        yield* $(self.workflow.stateManager.cancelTask(self));
        const result = yield* $(
          self.activities.onCancel.callbacks.procedure({
            ...activityContext,
            context,
            input: beforeResult,
          })
        );
        yield* $(
          self.activities.onCancel.callbacks.after({
            ...activityContext,
            context,
            input: result,
          })
        );
      }
    });
  }

  isEnabled() {
    return this.isStateEqualTo('enabled');
  }

  isActive() {
    return this.isStateEqualTo('active');
  }

  isStateEqualTo(state: TaskState) {
    return pipe(
      this.getState(),
      Effect.map((s) => s === state)
    );
  }

  cancelCancellationRegion(context: object) {
    const taskUpdates = Object.values(this.cancellationRegion.tasks).map((t) =>
      t.cancel(context)
    );
    const conditionUpdates = Object.values(
      this.cancellationRegion.conditions
    ).map((c) => c.cancel(context));

    return Effect.allParDiscard([...taskUpdates, ...conditionUpdates]);
  }

  private produceTokensInOutgoingFlows(context: object) {
    switch (this.splitType) {
      case 'or':
        return this.produceOrSplitTokensInOutgoingFlows(context);
      case 'xor':
        return this.produceXorSplitTokensInOutgoingFlows(context);
      default:
        return this.produceAndSplitTokensInOutgoingFlows(context);
    }
  }

  private produceOrSplitTokensInOutgoingFlows(context: object) {
    const flows = this.outgoingFlows;
    const updates = Array.from(flows).map((flow) => {
      return Effect.gen(function* ($) {
        if (flow.isDefault) {
          yield* $(flow.nextElement.incrementMarking(context));
        } else if (
          flow.predicate ? yield* $(flow.predicate({ context })) : false
        ) {
          yield* $(flow.nextElement.incrementMarking(context));
        }
      });
    });
    return Effect.allParDiscard(updates);
  }

  private produceXorSplitTokensInOutgoingFlows(context: object) {
    const flows = this.outgoingFlows;
    const sortedFlows = Array.from(flows).sort((flowA, flowB) => {
      return flowA.order > flowB.order ? 1 : flowA.order < flowB.order ? -1 : 0;
    });

    return Effect.gen(function* ($) {
      for (const flow of sortedFlows) {
        if (flow.isDefault) {
          return yield* $(flow.nextElement.incrementMarking(context));
        } else if (
          flow.predicate ? yield* $(flow.predicate({ context })) : false
        ) {
          return yield* $(flow.nextElement.incrementMarking(context));
        }
      }
    });
  }

  private produceAndSplitTokensInOutgoingFlows(context: object) {
    const updates = Array.from(this.outgoingFlows).map((flow) => {
      return flow.nextElement.incrementMarking(context);
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
    return this.workflow.isOrJoinSatisfied(this);
  }

  private isXorJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.allPar(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          )
        )
      );
      return markings.filter((m) => m > 0).length === 1 ? true : false;
    });
  }

  private isAndJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.allPar(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          )
        )
      );

      return markings.filter((m) => m > 0).length === markings.length
        ? true
        : false;
    });
  }
}
