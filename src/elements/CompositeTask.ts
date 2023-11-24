import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import {
  CompositeTaskActivities,
  DefaultTaskActivityPayload,
  JoinType,
  SplitType,
  TaskActionsService,
  WorkflowId,
  isValidTaskInstanceTransition,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is exited and prev condition(s)
// have positive marking, so it should transition to enabled again

export class CompositeTask extends BaseTask {
  readonly activities: CompositeTaskActivities;
  readonly subWorkflow: Workflow;

  constructor(
    name: string,
    workflow: Workflow,
    subWorkflow: Workflow,
    activities: CompositeTaskActivities,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    super(name, workflow, props);
    this.subWorkflow = subWorkflow;
    this.activities = activities;
  }

  getActivityContext(workflowId: WorkflowId): DefaultTaskActivityPayload {
    return {
      getTaskName: () => Effect.succeed(this.name),
      getWorkflowId: () => Effect.succeed(workflowId),
      getTaskState: () => this.getState(workflowId),
    };
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
            })
          )
        );

        const startSubWorkflow = () =>
          Effect.gen(function* ($) {
            const workflow = yield* $(
              self.subWorkflow.initialize({ workflowId, taskName: self.name })
            );
            return workflow;
          }).pipe(Effect.provideService(State, stateManager));

        const result = yield* $(
          self.activities.onFire({
            ...activityContext,
            context,
            input,
            fireTask() {
              return pipe(
                performFire,
                Effect.map(() => ({ startSubWorkflow })),
                Effect.provideService(State, stateManager)
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
            })
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
                Effect.provideService(State, stateManager),
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

      if (!taskWorkItems.some((workItem) => workItem.state === 'initialized')) {
        yield* $(taskActionsService.exitTask(self.name));
      }
    });
  }

  cancelCancellationRegion(workflowId: WorkflowId, context: object) {
    const taskUpdates = Object.values(this.cancellationRegion.tasks).map((t) =>
      t.cancel(workflowId, context)
    );
    const conditionUpdates = Object.values(
      this.cancellationRegion.conditions
    ).map((c) => c.cancel(workflowId, context));

    return Effect.all(
      [
        Effect.all(taskUpdates, { batching: true, discard: true }),
        Effect.all(conditionUpdates, { batching: true, discard: true }),
      ],
      { discard: true }
    );
  }
}
