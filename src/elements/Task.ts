import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import {
  DefaultTaskActivityPayload,
  JoinType,
  SplitType,
  TaskActionsService,
  TaskActivities,
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
// TODO: handle case where task is completed and prev condition(s)
// have positive marking, so it should transition to enabled again
// TODO: add onExecute
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

  getActivityContext(): DefaultTaskActivityPayload {
    return {
      getTaskId: () => Effect.succeed(this.id),
      getTaskName: () => Effect.succeed(this.name),
      getWorkflowId: () => Effect.succeed(this.workflow.id),
      getTaskState: () => this.getState(),
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

          const performEnable = yield* $(
            Effect.once(self.workflow.stateManager.enableTask(self))
          );

          const result = yield* $(
            self.activities.onEnable({
              ...activityContext,
              context,
              enableTask() {
                return pipe(
                  performEnable,
                  Effect.map(() => ({ activateTask }))
                );
              },
            }) as Effect.Effect<never, never, unknown>
          );

          yield* $(performEnable);

          return result;
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

        const performDisable = yield* $(
          Effect.once(self.workflow.stateManager.disableTask(self))
        );

        const result = yield* $(
          self.activities.onDisable({
            ...activityContext,
            context,
            disableTask() {
              return performDisable;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performDisable);

        return result;
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

        const performActivate = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(self.workflow.stateManager.activateTask(self));
              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(context)
              );
              yield* $(Effect.allParDiscard(updates));
            })
          )
        );

        const result = yield* $(
          self.activities.onActivate({
            ...activityContext,
            context,
            input,
            activateTask() {
              return pipe(
                performActivate,
                Effect.map(() => ({ completeTask }))
              );
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performActivate);

        return result;
      }
    });
  }

  complete(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'completed')) {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);

        const performComplete = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(self.workflow.stateManager.completeTask(self));
              yield* $(self.cancelCancellationRegion(context));
              yield* $(self.produceTokensInOutgoingFlows(context));
              yield* $(self.enablePostTasks(context));
            })
          )
        );

        const result = yield* $(
          self.activities.onComplete({
            ...activityContext,
            context,
            input,
            completeTask() {
              return pipe(
                performComplete,
                Effect.provideService(TaskActionsService, taskActionsService)
              );
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performComplete);

        return result;
      }
    });
  }

  cancel(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'canceled')) {
        const activityContext = self.getActivityContext();

        const performCancel = yield* $(
          Effect.once(self.workflow.stateManager.cancelTask(self))
        );

        const result = yield* $(
          self.activities.onCancel({
            ...activityContext,
            context,
            cancelTask() {
              return performCancel;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performCancel);

        return result;
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

    return Effect.allDiscard([
      Effect.allParDiscard(taskUpdates),
      Effect.allParDiscard(conditionUpdates),
    ]);
  }

  private produceTokensInOutgoingFlows(context: object) {
    switch (this.splitType) {
      case 'or':
        return this.produceOrSplitTokensInOutgoingFlows(context);
      case 'xor':
        return this.produceXorSplitTokensInOutgoingFlows(context);
      default:
        return this.produceAndSplitTokensInOutgoingFlows();
    }
  }

  private produceOrSplitTokensInOutgoingFlows(context: object) {
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
          return yield* $(flow.nextElement.incrementMarking());
        } else if (
          flow.predicate ? yield* $(flow.predicate({ context })) : false
        ) {
          return yield* $(flow.nextElement.incrementMarking());
        }
      }
    });
  }

  private produceAndSplitTokensInOutgoingFlows() {
    const updates = Array.from(this.outgoingFlows).map((flow) => {
      return flow.nextElement.incrementMarking();
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

  private enablePostTasks(context: object) {
    return Effect.allDiscard(
      Array.from(this.outgoingFlows).map((flow) =>
        flow.nextElement.enableTasks(context)
      )
    );
  }
}