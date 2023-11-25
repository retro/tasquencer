import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import { AnyWorkItemActivities } from '../builder/WorkItemBuilder.js';
import { InvalidTaskState } from '../errors.js';
import {
  DefaultTaskActivityPayload,
  JoinType,
  SplitType,
  TaskActionsService,
  TaskActivities,
  TaskState,
  WorkItemId,
  WorkflowId,
  activeWorkItemInstanceStates,
  isValidTaskInstanceTransition,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is exited and prev condition(s)
// have positive marking, so it should transition to enabled again

export class Task extends BaseTask {
  readonly activities: TaskActivities;
  readonly workItemActivities: AnyWorkItemActivities;

  constructor(
    name: string,
    workflow: Workflow,
    activities: TaskActivities,
    workItemActivities: AnyWorkItemActivities,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    super(name, workflow, props);
    this.activities = activities;
    this.workItemActivities = workItemActivities;
  }

  getActivityContext(workflowId: WorkflowId): DefaultTaskActivityPayload {
    return {
      getTaskName: () => Effect.succeed(this.name),
      getWorkflowId: () => Effect.succeed(workflowId),
      getTaskState: () => this.getState(workflowId),
    };
  }

  getWorkItems(workflowId: WorkflowId) {
    const { name } = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getWorkItems(workflowId, name));
    });
  }

  enable(workflowId: WorkflowId, context: object) {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied(workflowId));
        if (isJoinSatisfied) {
          const activityContext = self.getActivityContext(workflowId);
          const taskActionsService = yield* $(TaskActionsService);
          const fireTask = (input?: unknown) => {
            return taskActionsService.fireTask(self.name, input);
          };

          const performEnable = yield* $(
            Effect.once(stateManager.enableTask(workflowId, self.name))
          );

          const result = yield* $(
            self.activities.onEnable({
              ...activityContext,
              context,
              enableTask() {
                return pipe(
                  performEnable,
                  Effect.map(() => ({ fireTask }))
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

  disable(workflowId: WorkflowId, context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'disabled')) {
        const activityContext = self.getActivityContext(workflowId);

        const performDisable = yield* $(
          Effect.once(stateManager.disableTask(workflowId, self.name))
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

  fire(workflowId: WorkflowId, context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'fired')) {
        const activityContext = self.getActivityContext(workflowId);
        const taskActionsService = yield* $(TaskActionsService);

        const performFire = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.fireTask(workflowId, self.name));

              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(workflowId, context)
              );
              yield* $(Effect.all(updates, { discard: true, batching: true }));
            }).pipe(Effect.provideService(State, stateManager))
          )
        );

        const createWorkItem = (payload: unknown) =>
          self.createWorkItem(workflowId, payload);

        const result = yield* $(
          self.activities.onFire({
            ...activityContext,
            context,
            input,
            fireTask() {
              return pipe(
                performFire,
                Effect.map(() => ({ createWorkItem }))
              );
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performFire);

        yield* $(
          self.maybeExit(workflowId),
          Effect.provideService(TaskActionsService, taskActionsService)
        );

        return result;
      }
    });
  }

  exit(workflowId: WorkflowId, context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'exited')) {
        const activityContext = self.getActivityContext(workflowId);
        const taskActionsService = yield* $(TaskActionsService);

        const performExit = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.exitTask(workflowId, self.name));
              yield* $(self.cancelCancellationRegion(workflowId, context));
              yield* $(self.produceTokensInOutgoingFlows(workflowId, context));
              yield* $(self.enablePostTasks(workflowId, context));
            }).pipe(Effect.provideService(State, stateManager))
          )
        );

        const result = yield* $(
          self.activities.onExit({
            ...activityContext,
            context,
            input,
            exitTask() {
              return pipe(
                performExit,
                Effect.provideService(TaskActionsService, taskActionsService)
              );
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performExit);

        return result;
      }
    });
  }

  cancel(workflowId: WorkflowId, context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'canceled')) {
        const activityContext = self.getActivityContext(workflowId);

        const performCancel = yield* $(
          Effect.once(stateManager.cancelTask(workflowId, self.name))
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

  maybeExit(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const taskActionsService = yield* $(TaskActionsService);
      const taskWorkItems = yield* $(
        stateManager.getWorkItems(workflowId, self.name)
      );

      if (
        !taskWorkItems.some((workItem) =>
          activeWorkItemInstanceStates.has(workItem.state)
        )
      ) {
        yield* $(taskActionsService.exitTask(self.name));
      }
    });
  }

  createWorkItem(workflowId: WorkflowId, payload: unknown) {
    const { name } = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.createWorkItem(workflowId, name, payload));
    });
  }

  completeWorkItem(workflowId: WorkflowId, workItemId: WorkItemId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState(workflowId));
      const stateManager = yield* $(State);
      if (state === 'fired') {
        yield* $(
          stateManager.updateWorkItemState(
            workflowId,
            self.name,
            workItemId,
            'completed'
          )
        );

        yield* $(self.maybeExit(workflowId));
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskState({
              workflowId: workflowId,
              taskName: self.name,
              state,
            })
          )
        );
      }
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
      this.getState(workflowId),
      Effect.map((s) => s === state)
    );
  }
}
