import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import {
  CompositeTaskActivities,
  JoinType,
  SplitType,
  TaskActionsService,
  WorkflowId,
  activeWorkflowInstanceStates,
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

  enable(workflowId: WorkflowId) {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied(workflowId));
        if (isJoinSatisfied) {
          const defaultActivityPayload = yield* $(
            self.getDefaultActivityPayload(workflowId)
          );
          const taskActionsService = yield* $(TaskActionsService);
          const enqueueFireTask = (input?: unknown) => {
            return taskActionsService.fireTask(self.name, input);
          };

          const perform = yield* $(
            Effect.once(stateManager.enableTask(workflowId, self.name))
          );

          const result = yield* $(
            self.activities.onEnable({
              ...defaultActivityPayload,
              enableTask() {
                return pipe(
                  perform,
                  Effect.map(() => ({ enqueueFireTask }))
                );
              },
            }) as Effect.Effect<never, never, unknown>
          );

          yield* $(perform);

          return result;
        }
      }
    });
  }

  disable(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'disabled')) {
        const defaultActivityPayload = yield* $(
          self.getDefaultActivityPayload(workflowId)
        );

        const performDisable = yield* $(
          Effect.once(stateManager.disableTask(workflowId, self.name))
        );

        const result = yield* $(
          self.activities.onDisable({
            ...defaultActivityPayload,
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

  fire(workflowId: WorkflowId, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'fired')) {
        const defaultActivityPayload = yield* $(
          self.getDefaultActivityPayload(workflowId)
        );
        const taskActionsService = yield* $(TaskActionsService);

        const performFire = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.fireTask(workflowId, self.name));

              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(workflowId)
              );
              yield* $(Effect.all(updates, { discard: true, batching: true }));
            })
          )
        );

        const initializeWorkflow = (context: unknown) =>
          Effect.gen(function* ($) {
            const workflow = yield* $(
              self.subWorkflow.initialize(context, {
                workflowId,
                taskName: self.name,
              })
            );
            return workflow;
          }).pipe(Effect.provideService(State, stateManager));

        const result = yield* $(
          self.activities.onFire(
            {
              ...defaultActivityPayload,
              fireTask() {
                return pipe(
                  performFire,
                  Effect.map(() => ({ initializeWorkflow })),
                  Effect.provideService(State, stateManager)
                );
              },
            },
            input
          ) as Effect.Effect<never, never, unknown>
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

  exit(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);
      if (isValidTaskInstanceTransition(state, 'exited')) {
        const defaultActivityPayload = yield* $(
          self.getDefaultActivityPayload(workflowId)
        );
        const taskActionsService = yield* $(TaskActionsService);

        const performExit = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.exitTask(workflowId, self.name));
              yield* $(self.cancelCancellationRegion(workflowId));
              yield* $(self.produceTokensInOutgoingFlows(workflowId));
              yield* $(self.enablePostTasks(workflowId));
            })
          )
        );

        const result = yield* $(
          self.activities.onExit({
            ...defaultActivityPayload,
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

  cancel(workflowId: WorkflowId) {
    // TODO: sub workflows / sub work items should be canceled
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);
      if (isValidTaskInstanceTransition(state, 'canceled')) {
        const defaultActivityPayload = yield* $(
          self.getDefaultActivityPayload(workflowId)
        );

        const performCancel = yield* $(
          Effect.once(stateManager.cancelTask(workflowId, self.name))
        );

        const result = yield* $(
          self.activities.onCancel({
            ...defaultActivityPayload,
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
        stateManager.getWorkflows(workflowId, self.name)
      );

      if (
        !taskWorkItems.some((workItem) =>
          activeWorkflowInstanceStates.has(workItem.state)
        )
      ) {
        yield* $(taskActionsService.exitTask(self.name));
      }
    });
  }
}
