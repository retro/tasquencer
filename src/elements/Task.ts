import { Effect, pipe } from 'effect';

import { TaskName, isValidTaskTransition } from '../state/types.js';
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

// TODO: handle case where task is completed and prev condition(s)
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
  readonly splitType: SplitType | undefined;
  readonly joinType: JoinType | undefined;

  constructor(
    name: string,
    workflow: Workflow,
    activities: TaskActivities,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    this.name = TaskName(name);
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
      return yield* $(
        self.workflow.stateManager.getWorkflowTaskState(
          self.workflow.id,
          self.name
        )
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

  enable(context: object) {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());

      if (isValidTaskTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied());
        if (isJoinSatisfied) {
          const activityContext = self.getActivityContext();
          const taskActionsService = yield* $(TaskActionsService);
          const activateTask = (input?: unknown) => {
            return taskActionsService.activateTask(self.name, input);
          };

          const performEnable = yield* $(
            Effect.once(
              self.workflow.stateManager.enableWorkflowTask(
                self.workflow.id,
                self.name
              )
            )
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
      if (isValidTaskTransition(state, 'disabled')) {
        const activityContext = self.getActivityContext();

        const performDisable = yield* $(
          Effect.once(
            self.workflow.stateManager.disableWorkflowTask(
              self.workflow.id,
              self.name
            )
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
      if (isValidTaskTransition(state, 'fired')) {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);
        const completeTask = (input?: unknown) => {
          return taskActionsService.completeTask(self.name, input);
        };

        const performActivate = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(
                self.workflow.stateManager.fireWorkflowTask(
                  self.workflow.id,
                  self.name
                )
              );
              const preSet = Object.values(self.preSet);
              const updates = preSet.map((condition) =>
                condition.decrementMarking(context)
              );
              yield* $(Effect.all(updates, { discard: true, batching: true }));
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

  execute(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (state === 'fired') {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);
        const completeTask = (input?: unknown) => {
          return taskActionsService.completeTask(self.name, input);
        };

        return yield* $(
          self.activities.onExecute({
            ...activityContext,
            context,
            input,
            completeTask,
          }) as Effect.Effect<never, never, unknown>
        );
      }
    });
  }

  complete(context: object, input: unknown = undefined) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTaskTransition(state, 'completed')) {
        const activityContext = self.getActivityContext();
        const taskActionsService = yield* $(TaskActionsService);

        const performComplete = yield* $(
          Effect.once(
            Effect.gen(function* ($) {
              yield* $(
                self.workflow.stateManager.completeWorkflowTask(
                  self.workflow.id,
                  self.name
                )
              );
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
      if (isValidTaskTransition(state, 'canceled')) {
        const activityContext = self.getActivityContext();

        const performCancel = yield* $(
          Effect.once(
            self.workflow.stateManager.cancelWorkflowTask(
              self.workflow.id,
              self.name
            )
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
