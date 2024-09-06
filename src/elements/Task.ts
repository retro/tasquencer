import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import { AnyWorkItemActivities } from '../builder/WorkItemBuilder.js';
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
  ShouldTaskCompleteFn,
  ShouldTaskFailFn,
  SplitType,
  TaskActivities,
  TaskState,
  WorkItemId,
  WorkflowId,
  isValidTaskInstanceTransition,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Workflow } from './Workflow.js';

export class Task extends BaseTask {
  readonly activities: TaskActivities<any>;
  readonly workItemActivities: AnyWorkItemActivities;
  readonly shouldComplete: ShouldTaskCompleteFn<any, any, never, never>;
  readonly shouldFail: ShouldTaskFailFn<any, any, never, never>;

  constructor(
    name: string,
    workflow: Workflow,
    activities: TaskActivities<any>,
    workItemActivities: AnyWorkItemActivities,
    shouldComplete: ShouldTaskCompleteFn<any, any, never, never>,
    shouldFail: ShouldTaskFailFn<any, any, never, never>,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    super(name, workflow, props);
    this.activities = activities;
    this.workItemActivities = workItemActivities;
    this.shouldComplete = shouldComplete;
    this.shouldFail = shouldFail;
  }

  getWorkItems(workflowId: WorkflowId) {
    const { name } = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      return yield* stateManager.getWorkItems(workflowId, name);
    });
  }

  enable(workflowId: WorkflowId) {
    const self = this;

    return Effect.gen(function* () {
      const state = yield* self.getTaskState(workflowId);
      const stateManager = yield* State;

      if (isValidTaskInstanceTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* self.isJoinSatisfied(workflowId);
        if (isJoinSatisfied) {
          const executionContext = yield* ExecutionContext;
          const path = yield* self.getTaskPath(workflowId);
          const enqueueStartTask = (input?: unknown) => {
            return executionContext.queue.offer({
              path,
              type: 'startTask',
              input,
            });
          };

          const perform = yield* Effect.once(
            stateManager.enableTask(workflowId, self.name)
          );

          const result = yield* self.activities.onEnable({
            ...executionContext.defaultActivityPayload,
            enableTask() {
              return pipe(
                perform,
                Effect.tap(() => executionContext.emitStateChanges()),
                Effect.map(() => ({ enqueueStartTask }))
              );
            },
          }) as Effect.Effect<unknown>;

          yield* perform;

          return result;
        }
      } else {
        yield* Effect.fail(
          new InvalidTaskStateTransition({
            taskName: self.name,
            workflowId,
            from: state,
            to: 'enabled',
          })
        );
      }
    });
  }

  disable(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.getTaskState(workflowId);
      const stateManager = yield* State;

      if (isValidTaskInstanceTransition(state, 'disabled')) {
        const executionContext = yield* ExecutionContext;

        const perform = yield* Effect.once(
          stateManager.disableTask(workflowId, self.name)
        );

        const result = yield* self.activities.onDisable({
          ...executionContext.defaultActivityPayload,
          disableTask() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        }) as Effect.Effect<unknown>;

        yield* perform;

        return result;
      } else {
        yield* Effect.fail(
          new InvalidTaskStateTransition({
            taskName: self.name,
            workflowId,
            from: state,
            to: 'disabled',
          })
        );
      }
    });
  }

  start(workflowId: WorkflowId, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.getTaskState(workflowId);
      const stateManager = yield* State;

      if (isValidTaskInstanceTransition(state, 'started')) {
        const executionContext = yield* ExecutionContext;

        const perform = yield* Effect.once(
          Effect.gen(function* () {
            yield* stateManager.startTask(workflowId, self.name);

            const preSet = Object.values(self.preSet);
            const updates = preSet.map((condition) =>
              condition.decrementMarking(workflowId)
            );
            yield* Effect.all(updates, {
              discard: true,
              concurrency: 'inherit',
              batching: 'inherit',
            });
          }).pipe(
            Effect.provideService(State, stateManager),
            Effect.provideService(ExecutionContext, executionContext)
          )
        );

        const initializeWorkItem = (payload: unknown) =>
          self
            .initializeWorkItem(workflowId, payload)
            .pipe(Effect.provideService(State, stateManager));

        const path = yield* self.getTaskPath(workflowId);

        const enqueueStartWorkItem = (
          workItemId: WorkItemId,
          input?: unknown
        ) => {
          return executionContext.queue.offer({
            path: [...path, workItemId],
            type: 'startWorkItem',
            input,
          });
        };

        const result = yield* self.activities.onStart(
          {
            ...executionContext.defaultActivityPayload,
            startTask() {
              return pipe(
                perform,
                Effect.tap(() => executionContext.emitStateChanges()),
                Effect.map(() => ({
                  initializeWorkItem,
                  enqueueStartWorkItem,
                }))
              );
            },
          },
          input
        ) as Effect.Effect<unknown>;

        yield* perform;

        yield* self.maybeComplete(workflowId);

        return result;
      } else {
        yield* Effect.fail(
          new InvalidTaskStateTransition({
            taskName: self.name,
            workflowId,
            from: state,
            to: 'started',
          })
        );
      }
    });
  }

  complete(
    workflowId: WorkflowId
  ): Effect.Effect<
    unknown,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition
    | InvalidTaskState
    | WorkflowDoesNotExist
    | EndConditionDoesNotExist
    | InvalidWorkflowStateTransition
    | WorkItemDoesNotExist
    | InvalidWorkItemTransition,
    ExecutionContext | State
  > {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.getTaskState(workflowId);
      const stateManager = yield* State;

      if (isValidTaskInstanceTransition(state, 'completed')) {
        const executionContext = yield* ExecutionContext;
        const perform = yield* Effect.once(
          Effect.gen(function* () {
            const workItems = (yield* stateManager.getWorkItems(
              workflowId,
              self.name
            )).filter(
              (w) => w.state === 'started' || w.state === 'initialized'
            );
            yield* Effect.all(
              workItems.map(({ id }) =>
                self.cancelWorkItem(workflowId, id, undefined, false)
              ),
              { concurrency: 'inherit', batching: true }
            );
            yield* stateManager.completeTask(workflowId, self.name);
            yield* self.cancelCancellationRegion(workflowId);

            const isJoinSatisfied = yield* self.isJoinSatisfied(workflowId);

            if (isJoinSatisfied) {
              yield* self.enable(workflowId);
            }

            yield* self.produceTokensInOutgoingFlows(workflowId);
            yield* self.enablePostTasks(workflowId);

            yield* self.workflow.maybeComplete(workflowId);
          }).pipe(
            Effect.provideService(State, stateManager),
            Effect.provideService(ExecutionContext, executionContext)
          )
        );

        const result = yield* self.activities.onComplete({
          ...executionContext.defaultActivityPayload,
          completeTask() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        }) as Effect.Effect<unknown>;

        yield* perform;

        return result;
      } else {
        yield* Effect.fail(
          new InvalidTaskStateTransition({
            taskName: self.name,
            workflowId,
            from: state,
            to: 'completed',
          })
        );
      }
    });
  }

  cancel(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.getTaskState(workflowId);
      const stateManager = yield* State;

      if (isValidTaskInstanceTransition(state, 'canceled')) {
        const executionContext = yield* ExecutionContext;

        const perform = yield* Effect.once(
          Effect.gen(function* () {
            const workItems = (yield* stateManager.getWorkItems(
              workflowId,
              self.name
            )).filter(
              (workItem) =>
                workItem.state === 'started' || workItem.state === 'initialized'
            );
            yield* Effect.all(
              workItems.map(({ id }) =>
                self.cancelWorkItem(workflowId, id, undefined, false)
              ),
              { concurrency: 'inherit', batching: 'inherit' }
            );
            yield* stateManager.cancelTask(workflowId, self.name);
          }).pipe(
            Effect.provideService(State, stateManager),
            Effect.provideService(ExecutionContext, executionContext)
          )
        );

        const result = yield* self.activities.onCancel({
          ...executionContext.defaultActivityPayload,
          cancelTask() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        }) as Effect.Effect<unknown>;

        yield* perform;

        return result;
      } else {
        yield* Effect.fail(
          new InvalidTaskStateTransition({
            taskName: self.name,
            workflowId,
            from: state,
            to: 'canceled',
          })
        );
      }
    });
  }

  fail(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.getTaskState(workflowId);
      const stateManager = yield* State;

      if (isValidTaskInstanceTransition(state, 'canceled')) {
        const executionContext = yield* ExecutionContext;

        const perform = yield* Effect.once(
          Effect.gen(function* () {
            const workItems = (yield* stateManager.getWorkItems(
              workflowId,
              self.name
            )).filter(
              (workItem) =>
                workItem.state === 'started' || workItem.state === 'initialized'
            );
            yield* Effect.all(
              workItems.map(({ id }) =>
                self.cancelWorkItem(workflowId, id, undefined, false)
              ),
              { concurrency: 'inherit', batching: 'inherit' }
            );
            yield* stateManager.failTask(workflowId, self.name);
            yield* self.workflow.fail(workflowId);
          }).pipe(
            Effect.provideService(State, stateManager),
            Effect.provideService(ExecutionContext, executionContext)
          )
        );

        const result = yield* self.activities.onFail({
          ...executionContext.defaultActivityPayload,
          failTask() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        }) as Effect.Effect<unknown>;

        yield* perform;

        return result;
      } else {
        yield* Effect.fail(
          new InvalidTaskStateTransition({
            taskName: self.name,
            workflowId,
            from: state,
            to: 'canceled',
          })
        );
      }
    });
  }

  maybeComplete(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const workItems = yield* stateManager.getWorkItems(workflowId, self.name);

      const result = yield* self.shouldComplete({
        workItems,
        getWorkflowContext() {
          return stateManager.getWorkflowContext(workflowId);
        },
      });

      if (result) {
        yield* self.complete(workflowId);
      }
    });
  }

  maybeFail(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const workItems = yield* stateManager.getWorkItems(workflowId, self.name);

      const result = yield* self.shouldFail({
        workItems,
        getWorkflowContext() {
          return stateManager.getWorkflowContext(workflowId);
        },
      });

      if (result) {
        yield* self.fail(workflowId);
      }
    });
  }

  private getWorkItemActivityPayload(
    workflowId: WorkflowId,
    workItemId: WorkItemId
  ) {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;

      return {
        ...executionContext.defaultActivityPayload,
        getWorkItem() {
          return self
            .getWorkItem(workflowId, workItemId)
            .pipe(Effect.provideService(State, stateManager));
        },
        updateWorkItemPayload(payload: unknown) {
          return self.updateWorkItem(workflowId, workItemId, payload).pipe(
            Effect.tap(() => executionContext.emitStateChanges()),
            Effect.provideService(State, stateManager)
          );
        },
      };
    });
  }

  initializeWorkItem(workflowId: WorkflowId, payload: unknown) {
    const self = this;
    return Effect.gen(function* () {
      yield* self.ensureIsStarted(workflowId);

      const stateManager = yield* State;
      return yield* stateManager.initializeWorkItem(
        workflowId,
        self.name,
        payload
      );
    });
  }

  startWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown
  ) {
    const self = this;
    return Effect.gen(function* () {
      yield* self.ensureIsStarted(workflowId);

      const stateManager = yield* State;
      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* stateManager.updateWorkItemState(
            workflowId,
            self.name,
            workItemId,
            'started'
          );
        }).pipe(Effect.provideService(State, stateManager))
      );

      const executionContext = yield* ExecutionContext;

      const workItemActivityPayload = yield* self.getWorkItemActivityPayload(
        workflowId,
        workItemId
      );

      const taskPath = yield* self.getTaskPath(workflowId);
      const path = [...taskPath, workItemId];

      const result = yield* self.workItemActivities.onStart(
        {
          ...workItemActivityPayload,
          startWorkItem() {
            return Effect.gen(function* () {
              yield* perform.pipe(
                Effect.tap(() => executionContext.emitStateChanges())
              );
              return {
                enqueueCompleteWorkItem(input?: unknown) {
                  return executionContext.queue.offer({
                    path,
                    type: 'completeWorkItem',
                    input,
                  });
                },
                enqueueFailWorkItem(input?: unknown) {
                  return executionContext.queue.offer({
                    path,
                    type: 'failWorkItem',
                    input,
                  });
                },
                enqueueCancelWorkItem(input?: unknown) {
                  return executionContext.queue.offer({
                    path,
                    type: 'cancelWorkItem',
                    input,
                  });
                },
              };
            });
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;
      yield* self.maybeComplete(workflowId);

      return result;
    });
  }

  completeWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown
  ) {
    const self = this;
    return Effect.gen(function* () {
      yield* self.ensureIsStarted(workflowId);

      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;

      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* stateManager.updateWorkItemState(
            workflowId,
            self.name,
            workItemId,
            'completed'
          );
        }).pipe(Effect.provideService(State, stateManager))
      );

      const workItemActivityPayload = yield* self.getWorkItemActivityPayload(
        workflowId,
        workItemId
      );

      const result = yield* self.workItemActivities.onComplete(
        {
          ...workItemActivityPayload,
          completeWorkItem() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;
      yield* self.maybeComplete(workflowId);

      return result;
    });
  }

  cancelWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown,
    autoCompleteTask = true
  ) {
    const self = this;
    return Effect.gen(function* () {
      yield* self.ensureIsStarted(workflowId);

      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;

      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* stateManager.updateWorkItemState(
            workflowId,
            self.name,
            workItemId,
            'canceled'
          );
        }).pipe(Effect.provideService(State, stateManager))
      );

      const workItemActivityPayload = yield* self.getWorkItemActivityPayload(
        workflowId,
        workItemId
      );

      const result = yield* self.workItemActivities.onCancel(
        {
          ...workItemActivityPayload,
          cancelWorkItem() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;
      if (autoCompleteTask) {
        yield* self.maybeComplete(workflowId);
      }

      return result;
    });
  }

  failWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    input?: unknown,
    autoFailTask = true
  ) {
    const self = this;
    return Effect.gen(function* () {
      yield* self.ensureIsStarted(workflowId);

      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;

      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* stateManager.updateWorkItemState(
            workflowId,
            self.name,
            workItemId,
            'failed'
          );
        }).pipe(Effect.provideService(State, stateManager))
      );

      const workItemActivityPayload = yield* self.getWorkItemActivityPayload(
        workflowId,
        workItemId
      );

      const result = yield* self.workItemActivities.onFail(
        {
          ...workItemActivityPayload,
          failWorkItem() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;

      if (autoFailTask) {
        yield* self.maybeFail(workflowId);
      }

      return result;
    });
  }

  getWorkItem(workflowId: WorkflowId, workItemId: WorkItemId) {
    const { name } = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      return yield* stateManager.getWorkItem(workflowId, name, workItemId);
    });
  }

  updateWorkItem(
    workflowId: WorkflowId,
    workItemId: WorkItemId,
    payload: unknown
  ) {
    const { name } = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      return yield* stateManager.updateWorkItemPayload(
        workflowId,
        name,
        workItemId,
        payload
      );
    });
  }

  isEnabled(workflowId: WorkflowId) {
    return this.isStateEqualTo(workflowId, 'enabled');
  }

  isStarted(workflowId: WorkflowId) {
    return this.isStateEqualTo(workflowId, 'started');
  }

  ensureIsStarted(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const isStarted = yield* self.isStarted(workflowId);
      if (!isStarted) {
        const state = yield* self.getTaskState(workflowId);
        yield* Effect.fail(
          new InvalidTaskState({
            workflowId,
            taskName: self.name,
            state,
          })
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
