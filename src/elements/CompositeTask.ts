import { Effect, pipe } from 'effect';

import {
  CompositeTaskActivities,
  DefaultTaskActivityPayload,
  JoinType,
  SplitType,
  TaskActionsService,
  isValidTaskInstanceTransition,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is exited and prev condition(s)
// have positive marking, so it should transition to enabled again

export class CompositeTask extends BaseTask {
  readonly activities: CompositeTaskActivities;

  constructor(
    name: string,
    workflow: Workflow,
    activities: CompositeTaskActivities,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    super(name, workflow, props);
    this.activities = activities;
  }

  getActivityContext(): DefaultTaskActivityPayload {
    return {
      getTaskName: () => Effect.succeed(this.name),
      getWorkflowId: () => Effect.succeed(this.workflow.id),
      getTaskState: () => this.getState(),
    };
  }

  enable(context: object) {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());

      if (isValidTaskInstanceTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied());
        if (isJoinSatisfied) {
          const activityContext = self.getActivityContext();
          const taskActionsService = yield* $(TaskActionsService);
          const fireTask = (input?: unknown) => {
            return taskActionsService.fireTask(self.name, input);
          };

          const performEnable = yield* $(
            Effect.once(
              self.workflow.stateManager.enableTask(self.workflow.id, self.name)
            )
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

  disable(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTaskInstanceTransition(state, 'disabled')) {
        const activityContext = self.getActivityContext();

        const performDisable = yield* $(
          Effect.once(
            self.workflow.stateManager.disableTask(self.workflow.id, self.name)
          )
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

  fire(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTaskInstanceTransition(state, 'fired')) {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);

        const performFire = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(
                self.workflow.stateManager.fireTask(self.workflow.id, self.name)
              );

              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(context)
              );
              yield* $(Effect.all(updates, { discard: true, batching: true }));
            })
          )
        );

        const startSubWorkflow = () => Effect.succeed(undefined);

        const result = yield* $(
          self.activities.onFire({
            ...activityContext,
            context,
            input,
            fireTask() {
              return pipe(
                performFire,
                Effect.map(() => ({ startSubWorkflow }))
              );
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performFire);

        yield* $(
          self.maybeExit(),
          Effect.provideService(TaskActionsService, taskActionsService)
        );

        return result;
      }
    });
  }

  exit(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTaskInstanceTransition(state, 'exited')) {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);

        const performExit = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(
                self.workflow.stateManager.exitTask(self.workflow.id, self.name)
              );
              yield* $(self.cancelCancellationRegion(context));
              yield* $(self.produceTokensInOutgoingFlows(context));
              yield* $(self.enablePostTasks(context));
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

  cancel(context: object) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTaskInstanceTransition(state, 'canceled')) {
        const activityContext = self.getActivityContext();

        const performCancel = yield* $(
          Effect.once(
            self.workflow.stateManager.cancelTask(self.workflow.id, self.name)
          )
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

  maybeExit() {
    const self = this;
    return Effect.gen(function* ($) {
      const taskActionsService = yield* $(TaskActionsService);
      const taskWorkItems = yield* $(
        self.workflow.stateManager.getWorkItems(self.workflow.id, self.name)
      );

      if (!taskWorkItems.some((workItem) => workItem.state === 'initialized')) {
        yield* $(taskActionsService.exitTask(self.name));
      }
    });
  }

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
}
