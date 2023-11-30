import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import {
  CompositeTaskActivities,
  ExecutionContext,
  JoinType,
  ShouldCompositeTaskExitFn,
  SplitType,
  WorkflowId,
  isValidTaskInstanceTransition,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is exited and prev condition(s)
// have positive marking, so it should transition to enabled again

export class CompositeTask extends BaseTask {
  readonly activities: CompositeTaskActivities<any>;
  readonly subWorkflow: Workflow;
  readonly shouldExit: ShouldCompositeTaskExitFn<any, any, never, never>;

  constructor(
    name: string,
    workflow: Workflow,
    subWorkflow: Workflow,
    activities: CompositeTaskActivities<any>,
    shouldExit: ShouldCompositeTaskExitFn<any, any, never, never>,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    super(name, workflow, props);
    this.subWorkflow = subWorkflow;
    this.activities = activities;
    this.shouldExit = shouldExit;
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
          const enqueueFireTask = (input?: unknown) => {
            return executionContext.queue.offer({
              path: executionContext.path,
              type: 'fireTask',
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
      }
    });
  }

  fire(workflowId: WorkflowId, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const taskData = yield* $(self.getTask(workflowId));
      const stateManager = yield* $(State);

      if (isValidTaskInstanceTransition(taskData.state, 'fired')) {
        const executionContext = yield* $(ExecutionContext);

        const perform = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.fireTask(workflowId, self.name));

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
          self.activities.onFire(
            {
              ...executionContext.defaultActivityPayload,
              fireTask() {
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

        yield* $(self.maybeExit(workflowId));

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
        const executionContext = yield* $(ExecutionContext);

        const perform = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(stateManager.exitTask(workflowId, self.name));
              yield* $(self.cancelCancellationRegion(workflowId));
              yield* $(self.produceTokensInOutgoingFlows(workflowId));
              yield* $(self.enablePostTasks(workflowId));
              yield* $(self.workflow.maybeComplete(workflowId));
            })
          )
        );

        const result = yield* $(
          self.activities.onExit({
            ...executionContext.defaultActivityPayload,
            exitTask() {
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
      }
    });
  }

  maybeExit(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const workflows = yield* $(
        stateManager.getWorkflows(workflowId, self.name)
      );

      const result = yield* $(
        self.shouldExit({
          workflows,
          getWorkflowContext() {
            return stateManager.getWorkflowContext(workflowId);
          },
        })
      );

      if (result) {
        yield* $(self.exit(workflowId));
      }
    });
  }
}
