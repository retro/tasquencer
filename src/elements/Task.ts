import { Effect, pipe } from 'effect';

import { InvalidTaskState } from '../errors.js';
import {
  TaskName,
  WorkItemId,
  isValidTaskInstanceTransition,
} from '../state/types.js';
import {
  DefaultTaskActivityPayload,
  JoinType,
  SplitType,
  TaskActionsService,
  TaskActivities,
  TaskAnyWorkItemHandlers,
  TaskState,
} from '../types.js';
import { Condition } from './Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Workflow } from './Workflow.js';

// TODO: handle case where task is exited and prev condition(s)
// have positive marking, so it should transition to enabled again

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
  readonly name: TaskName;
  readonly activities: TaskActivities;
  readonly workItemHandlers: TaskAnyWorkItemHandlers;
  readonly splitType: SplitType | undefined;
  readonly joinType: JoinType | undefined;

  constructor(
    name: string,
    workflow: Workflow,
    activities: TaskActivities,
    workItemHandlers: TaskAnyWorkItemHandlers,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    this.name = TaskName(name);
    this.workflow = workflow;
    this.activities = activities;
    this.workItemHandlers = workItemHandlers;
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
      return yield* $(
        self.workflow.stateManager.getTaskState(self.workflow.id, self.name)
      );
    });
  }

  getActivityContext(): DefaultTaskActivityPayload {
    return {
      getTaskName: () => Effect.succeed(this.name),
      getWorkflowId: () => Effect.succeed(this.workflow.id),
      getTaskState: () => this.getState(),
    };
  }

  getWorkItems() {
    return this.workflow.stateManager.getWorkItems(this.workflow.id, this.name);
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
              const prevWorkItems = yield* $(
                self.workflow.stateManager.getWorkItems(
                  self.workflow.id,
                  self.name
                )
              );

              yield* $(
                self.workflow.stateManager.fireTask(self.workflow.id, self.name)
              );

              const initialWorkItemPayloads = yield* $(
                self.workItemHandlers.initialPayloads({
                  context,
                  workflowId: self.workflow.id,
                  taskName: self.name,
                  taskGeneration: 1,
                  prevWorkItems,
                })
              );

              for (const workItemPayload of initialWorkItemPayloads) {
                yield* $(
                  self.workflow.stateManager.createWorkItem(
                    self.workflow.id,
                    self.name,
                    workItemPayload
                  )
                );
              }

              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(context)
              );
              yield* $(Effect.all(updates, { discard: true, batching: true }));
              yield* $(
                self.maybeExit(),
                Effect.provideService(TaskActionsService, taskActionsService)
              );
            })
          )
        );

        const result = yield* $(
          self.activities.onFire({
            ...activityContext,
            context,
            input,
            fireTask() {
              return pipe(performFire);
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performFire);

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

  completeWorkItem(workItemId: WorkItemId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (state === 'fired') {
        yield* $(
          self.workflow.stateManager.updateWorkItemState(
            self.workflow.id,
            self.name,
            workItemId,
            'completed'
          )
        );

        yield* $(self.maybeExit());
      } else {
        yield* $(
          Effect.fail(
            new InvalidTaskState({
              workflowId: self.workflow.id,
              taskName: self.name,
              state,
            })
          )
        );
      }
    });
  }

  isEnabled() {
    return this.isStateEqualTo('enabled');
  }

  isFired() {
    return this.isStateEqualTo('fired');
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

    return Effect.all(
      [
        Effect.all(taskUpdates, { batching: true, discard: true }),
        Effect.all(conditionUpdates, { batching: true, discard: true }),
      ],
      { discard: true }
    );
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
    return Effect.all(updates, { batching: true, discard: true });
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
    return Effect.all(updates, { batching: true, discard: true });
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
        Effect.all(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          ),
          { batching: true }
        )
      );
      return markings.filter((m) => m > 0).length === 1 ? true : false;
    });
  }

  private isAndJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.all(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          ),
          { batching: true }
        )
      );

      return markings.filter((m) => m > 0).length === markings.length
        ? true
        : false;
    });
  }

  private enablePostTasks(context: object) {
    return Effect.all(
      Array.from(this.outgoingFlows).map((flow) =>
        flow.nextElement.enableTasks(context)
      ),
      { discard: true }
    );
  }
}
