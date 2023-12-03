import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import { InvalidTaskStateTransition } from '../errors.js';
import {
  CompositeTaskActivities,
  ExecutionContext,
  JoinType,
  ShouldCompositeTaskCompleteFn,
  SplitType,
  WorkflowId,
  isValidTaskInstanceTransition,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is completed and prev condition(s)
// have positive marking, so it should transition to enabled again

export class CompositeTask extends BaseTask {
  readonly activities: CompositeTaskActivities<any>;
  readonly subWorkflow: Workflow;
  readonly shouldComplete: ShouldCompositeTaskCompleteFn<
    any,
    any,
    never,
    never
  >;

  constructor(
    name: string,
    workflow: Workflow,
    subWorkflow: Workflow,
    activities: CompositeTaskActivities<any>,
    shouldComplete: ShouldCompositeTaskCompleteFn<any, any, never, never>,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    super(name, workflow, props);
    this.subWorkflow = subWorkflow;
    this.activities = activities;
    this.shouldComplete = shouldComplete;
  }

  enable(workflowId: WorkflowId) {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied(workflowId));
        if (isJoinSatisfied) {
          const executionContext = yield* $(ExecutionContext);
          const enqueueStartTask = (input?: unknown) => {
            return executionContext.queue.offer({
              path: executionContext.path,
              type: 'startTask',
              input,
            });
          };

          const perform = yield* $(
            Effect.once(stateManager.enableTask(workflowId, self.name))
          );

          const result = yield* $(
            self.activities.onEnable({
              ...executionContext.defaultActivityPayload,
              enableTask() {
                return pipe(
                  perform,
                  Effect.map(() => ({ enqueueStartTask }))
                );
              },
            }) as Effect.Effect<never, never, unknown>
          );

          yield* $(perform);

          return result;
        }
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              taskName: self.name,
              workflowId,
              from: state,
              to: 'enabled',
            })
          )
        );
      }
    });
  }

  disable(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'disabled')) {
        const executionContext = yield* $(ExecutionContext);

        const perform = yield* $(
          Effect.once(stateManager.disableTask(workflowId, self.name))
        );

        const result = yield* $(
          self.activities.onDisable({
            ...executionContext.defaultActivityPayload,
            disableTask() {
              return perform;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(perform);

        return result;
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              taskName: self.name,
              workflowId,
              from: state,
              to: 'disabled',
            })
          )
        );
      }
    });
  }

  start(workflowId: WorkflowId, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(state, 'started')) {
        const executionContext = yield* $(ExecutionContext);

        const perform = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.startTask(workflowId, self.name));

              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(workflowId)
              );
              yield* $(
                Effect.all(updates, { discard: true, batching: true }),
                Effect.provideService(State, stateManager),
                Effect.provideService(ExecutionContext, executionContext)
              );
            })
          )
        );

        const initializeWorkflow = (context: unknown) =>
          Effect.gen(function* ($) {
            const taskData = yield* $(self.getTask(workflowId));
            const workflow = yield* $(
              self.subWorkflow.initialize(context, {
                workflowId,
                workflowName: self.workflow.name,
                taskName: self.name,
                taskGeneration: taskData.generation,
              })
            );
            return workflow;
          }).pipe(Effect.provideService(State, stateManager));

        const enqueueStartWorkflow = (id: WorkflowId, input: unknown) => {
          return executionContext.queue.offer({
            path: [...executionContext.path, id],
            type: 'startWorkflow',
            input,
          });
        };

        const result = yield* $(
          self.activities.onStart(
            {
              ...executionContext.defaultActivityPayload,
              startTask() {
                return pipe(
                  perform,
                  Effect.map(() => ({
                    initializeWorkflow,
                    enqueueStartWorkflow,
                  }))
                );
              },
            },
            input
          ) as Effect.Effect<never, never, unknown>
        );

        yield* $(perform);

        yield* $(self.maybeComplete(workflowId));

        return result;
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              taskName: self.name,
              workflowId,
              from: state,
              to: 'started',
            })
          )
        );
      }
    });
  }

  complete(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getTaskState(workflowId));
      const stateManager = yield* $(State);
      if (isValidTaskInstanceTransition(state, 'completed')) {
        const executionContext = yield* $(ExecutionContext);

        const perform = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.completeTask(workflowId, self.name));
              yield* $(self.cancelCancellationRegion(workflowId));
              yield* $(self.produceTokensInOutgoingFlows(workflowId));
              yield* $(self.enablePostTasks(workflowId));
              yield* $(self.workflow.maybeComplete(workflowId));
            })
          )
        );

        const result = yield* $(
          self.activities.onComplete({
            ...executionContext.defaultActivityPayload,
            completeTask() {
              return pipe(
                perform,
                Effect.provideService(State, stateManager),
                Effect.provideService(ExecutionContext, executionContext)
              );
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(perform);

        return result;
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              taskName: self.name,
              workflowId,
              from: state,
              to: 'completed',
            })
          )
        );
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
        const executionContext = yield* $(ExecutionContext);

        const perform = yield* $(
          Effect.once(stateManager.cancelTask(workflowId, self.name))
        );

        const result = yield* $(
          self.activities.onCancel({
            ...executionContext.defaultActivityPayload,
            cancelTask() {
              return perform;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(perform);

        return result;
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              taskName: self.name,
              workflowId,
              from: state,
              to: 'canceled',
            })
          )
        );
      }
    });
  }

  maybeComplete(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const workflows = yield* $(
        stateManager.getWorkflows(workflowId, self.name)
      );

      const result = yield* $(
        self.shouldComplete({
          workflows,
          getWorkflowContext() {
            return stateManager.getWorkflowContext(workflowId);
          },
        })
      );

      if (result) {
        yield* $(self.complete(workflowId));
      }
    });
  }
}
