import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import { AnyWorkItemActivities } from '../builder/WorkItemBuilder.js';
import { InvalidTaskState } from '../errors.js';
import {
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

  getWorkItems(workflowId: WorkflowId) {
    const { name } = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getWorkItems(workflowId, name));
    });
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
            }).pipe(Effect.provideService(State, stateManager))
          )
        );

        const initializeWorkItem = (payload: unknown) =>
          self.initializeWorkItem(workflowId, payload);

        const result = yield* $(
          self.activities.onFire(
            {
              ...defaultActivityPayload,
              fireTask() {
                return pipe(
                  performFire,
                  Effect.map(() => ({ initializeWorkItem }))
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
            }).pipe(Effect.provideService(State, stateManager))
          )
        );

        const result = yield* $(
          self.activities.onExit({
            ...defaultActivityPayload,
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

  cancel(workflowId: WorkflowId) {
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

  private getWorkItemActivityPayload(
    workflowId: WorkflowId,
    workItemId: WorkItemId
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const defaultActivityPayload = yield* $(
        self.getDefaultActivityPayload(workflowId)
      );
      return {
        ...defaultActivityPayload,
        getWorkItem() {
          return self
            .getWorkItem(workflowId, workItemId)
            .pipe(Effect.provideService(State, stateManager));
        },
        updateWorkItem(payload: unknown) {
          return self
            .updateWorkItem(workflowId, workItemId, payload)
            .pipe(Effect.provideService(State, stateManager));
        },
      };
    });
  }

  initializeWorkItem(workflowId: WorkflowId, payload: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.ensureIsFired(workflowId));

      const stateManager = yield* $(State);
      return yield* $(
        stateManager.initializeWorkItem(workflowId, self.name, payload)
      );
    });
  }

  startWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.ensureIsFired(workflowId));

      const stateManager = yield* $(State);
      const performUpdate = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(
              stateManager.updateWorkItemState(
                workflowId,
                self.name,
                workItemId,
                'started'
              )
            );
          }).pipe(Effect.provideService(State, stateManager))
        )
      );

      const workItemActivityPayload = yield* $(
        self.getWorkItemActivityPayload(workflowId, workItemId)
      );

      const result = yield* $(
        self.workItemActivities.onStart(
          {
            ...workItemActivityPayload,
            startWorkItem() {
              return Effect.gen(function* ($) {
                yield* $(performUpdate);
                return {
                  enqueueCompleteWorkItem() {
                    return Effect.unit;
                  },
                  enqueueFailWorkItem() {
                    return Effect.unit;
                  },
                  enqueueCancelWorkItem() {
                    return Effect.unit;
                  },
                };
              });
            },
          },
          input
        ) as Effect.Effect<never, never, unknown>
      );

      yield* $(performUpdate);
      yield* $(self.maybeExit(workflowId));

      return result;
    });
  }

  completeWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.ensureIsFired(workflowId));

      const stateManager = yield* $(State);
      const performUpdate = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(
              stateManager.updateWorkItemState(
                workflowId,
                self.name,
                workItemId,
                'completed'
              )
            );
          }).pipe(Effect.provideService(State, stateManager))
        )
      );

      const workItemActivityPayload = yield* $(
        self.getWorkItemActivityPayload(workflowId, workItemId)
      );

      const result = yield* $(
        self.workItemActivities.onComplete(
          {
            ...workItemActivityPayload,
            completeWorkItem() {
              return performUpdate;
            },
          },
          input
        ) as Effect.Effect<never, never, unknown>
      );

      yield* $(performUpdate);
      yield* $(self.maybeExit(workflowId));

      return result;
    });
  }

  cancelWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.ensureIsFired(workflowId));

      const stateManager = yield* $(State);
      const performUpdate = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(
              stateManager.updateWorkItemState(
                workflowId,
                self.name,
                workItemId,
                'canceled'
              )
            );
          }).pipe(Effect.provideService(State, stateManager))
        )
      );

      const workItemActivityPayload = yield* $(
        self.getWorkItemActivityPayload(workflowId, workItemId)
      );

      const result = yield* $(
        self.workItemActivities.onCancel(
          {
            ...workItemActivityPayload,
            cancelWorkItem() {
              return performUpdate;
            },
          },
          input
        ) as Effect.Effect<never, never, unknown>
      );

      yield* $(performUpdate);
      yield* $(self.maybeExit(workflowId));

      return result;
    });
  }

  failWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.ensureIsFired(workflowId));

      const stateManager = yield* $(State);
      const performUpdate = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(
              stateManager.updateWorkItemState(
                workflowId,
                self.name,
                workItemId,
                'failed'
              )
            );
          }).pipe(Effect.provideService(State, stateManager))
        )
      );

      const workItemActivityPayload = yield* $(
        self.getWorkItemActivityPayload(workflowId, workItemId)
      );

      const result = yield* $(
        self.workItemActivities.onFail(
          {
            ...workItemActivityPayload,
            failWorkItem() {
              return performUpdate;
            },
          },
          input
        ) as Effect.Effect<never, never, unknown>
      );

      yield* $(performUpdate);
      yield* $(self.maybeExit(workflowId));

      return result;
    });
  }

  getWorkItem(workflowId: WorkflowId, workItemId: WorkItemId) {
    const { name } = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getWorkItem(workflowId, name, workItemId));
    });
  }

  updateWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    payload: unknown
  ) {
    const { name } = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(
        stateManager.updateWorkItem(workflowId, name, workItemId, payload)
      );
    });
  }

  isEnabled(workflowId: WorkflowId) {
    return this.isStateEqualTo(workflowId, 'enabled');
  }

  isFired(workflowId: WorkflowId) {
    return this.isStateEqualTo(workflowId, 'fired');
  }

  ensureIsFired(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const isFired = yield* $(self.isFired(workflowId));
      if (!isFired) {
        const state = yield* $(self.getTaskState(workflowId));
        yield* $(
          Effect.fail(
            new InvalidTaskState({
              workflowId,
              taskName: self.name,
              state,
            })
          )
        );
      }
    });
  }

  isStateEqualTo(workflowId: WorkflowId, state: TaskState) {
    return pipe(
      this.getTaskState(workflowId),
      Effect.map((s) => s === state)
    );
  }
}
