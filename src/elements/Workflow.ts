import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import { E2WFOJNet } from '../e2wfojnet.js';
import {
  ConditionDoesNotExist,
  ConditionDoesNotExistInStore,
  EndConditionDoesNotExist,
  InvalidTaskState,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  ParentWorkflowDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  TaskDoesNotExistInStore,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ConditionName,
  ElementTypes,
  ExecutionContext,
  TaskName,
  WorkflowActivities,
  WorkflowId,
  WorkflowInstanceParent,
  finalWorkflowInstanceStates,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { CompositeTask } from './CompositeTask.js';
import { Condition } from './Condition.js';
import { Marking } from './Marking.js';

export type WorkflowMetadata<T> = T extends Workflow<
  any,
  any,
  any,
  infer U,
  any
>
  ? U
  : never;
export class Workflow<
  _R = never,
  _E = never,
  Context = unknown,
  _WorkflowMetadata = object,
  _WorkflowAndWorkItemInstances = ElementTypes
> {
  readonly tasks: Record<string, BaseTask> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;
  readonly name: string;
  readonly activities: WorkflowActivities<any, any>;
  private parentTask?: CompositeTask;

  constructor(name: string, activities: WorkflowActivities<any, any>) {
    this.name = name;
    this.activities = activities;
  }

  addTask(task: BaseTask) {
    this.tasks[task.name] = task;
  }

  addCondition(condition: Condition) {
    this.conditions[condition.name] = condition;
  }

  setStartCondition(conditionName: string) {
    if (this.conditions[conditionName]) {
      this.startCondition = this.conditions[conditionName];
      return Effect.succeed(this.startCondition);
    }
    return Effect.fail(
      new ConditionDoesNotExist({ workflowName: this.name, conditionName })
    );
  }

  setEndCondition(conditionName: string) {
    if (this.conditions[conditionName]) {
      this.endCondition = this.conditions[conditionName];
      return Effect.succeed(this.endCondition);
    }
    return Effect.fail(
      new ConditionDoesNotExist({ workflowName: this.name, conditionName })
    );
  }

  setParentTask(parentTask: CompositeTask) {
    this.parentTask = parentTask;
  }

  initialize(context: unknown, parent: WorkflowInstanceParent = null) {
    const { tasks, conditions, name } = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const taskNames = Object.keys(tasks).map(TaskName);
      const conditionNames = Object.keys(conditions).map(ConditionName);
      return yield* stateManager.initializeWorkflow(
        {
          name: name,
          tasks: taskNames,
          conditions: conditionNames,
        },
        context,
        parent
      );
    });
  }

  start(id: WorkflowId, input?: unknown) {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;
      const defaultActivityPayload = yield* self.getDefaultActivityPayload(id);
      const perform = yield* Effect.once(
        Effect.gen(function* () {
          const startCondition = yield* self.getStartCondition();
          yield* stateManager.updateWorkflowState(id, 'started');
          yield* startCondition.incrementMarking(id);
          yield* startCondition.enableTasks(id);
        }).pipe(
          Effect.provideService(State, stateManager),
          Effect.provideService(ExecutionContext, executionContext)
        )
      );

      const result = yield* self.activities.onStart(
        {
          ...defaultActivityPayload,
          startWorkflow() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;

      return result;
    });
  }

  complete(
    id: WorkflowId
  ): Effect.Effect<
    void,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition
    | WorkflowDoesNotExist
    | InvalidTaskState
    | EndConditionDoesNotExist
    | InvalidWorkflowStateTransition
    | WorkItemDoesNotExist
    | InvalidWorkItemTransition,
    State | ExecutionContext
  > {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;
      const defaultActivityPayload = yield* self.getDefaultActivityPayload(id);
      const workflow = yield* stateManager.getWorkflow(id);
      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* Effect.all(
            Object.values(self.tasks).map((task) =>
              task.maybeCancelOrDisable(id)
            ),
            { concurrency: 'inherit', batching: 'inherit' }
          );
          yield* stateManager.updateWorkflowState(id, 'completed');
          if (self.parentTask && workflow.parent?.workflowId) {
            yield* self.parentTask.maybeComplete(workflow.parent.workflowId);
          }
        }).pipe(
          Effect.provideService(State, stateManager),
          Effect.provideService(ExecutionContext, executionContext)
        )
      );

      yield* self.activities.onComplete({
        ...defaultActivityPayload,
        completeWorkflow() {
          return pipe(
            perform,
            Effect.tap(() => executionContext.emitStateChanges())
          );
        },
      }) as Effect.Effect<unknown>;

      yield* perform;
    });
  }

  maybeComplete(id: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const workflowState = yield* self.getState(id);
      const isEndReached = yield* self.isEndReached(id);
      if (
        isEndReached &&
        !finalWorkflowInstanceStates.has(workflowState.state)
      ) {
        yield* self.complete(id);
      }
    });
  }

  cancel(id: WorkflowId, input?: unknown, autoCompleteParentTask = true) {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;

      const defaultActivityPayload = yield* self.getDefaultActivityPayload(id);
      const workflow = yield* stateManager.getWorkflow(id);
      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* Effect.all(
            Object.values(self.tasks).map((task) =>
              task.maybeCancelOrDisable(id)
            ),
            { concurrency: 'inherit', batching: 'inherit' }
          );
          yield* Effect.all(
            Object.values(self.conditions).map((condition) =>
              condition.cancel(id)
            ),
            { concurrency: 'inherit', batching: 'inherit' }
          );
          yield* stateManager.updateWorkflowState(id, 'canceled');
          if (
            self.parentTask &&
            workflow.parent?.workflowId &&
            autoCompleteParentTask
          ) {
            yield* self.parentTask.maybeComplete(workflow.parent.workflowId);
          }
        }).pipe(
          Effect.provideService(State, stateManager),
          Effect.provideService(ExecutionContext, executionContext)
        )
      );

      yield* self.activities.onCancel(
        {
          ...defaultActivityPayload,
          cancelWorkflow() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;
    });
  }

  fail(
    id: WorkflowId,
    input?: unknown
  ): Effect.Effect<
    void,
    | ConditionDoesNotExist
    | WorkflowDoesNotExist
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | InvalidTaskStateTransition
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist
    | InvalidTaskState
    | WorkItemDoesNotExist
    | InvalidWorkItemTransition,
    State | ExecutionContext
  > {
    const self = this;
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;

      const defaultActivityPayload = yield* self.getDefaultActivityPayload(id);
      const workflow = yield* stateManager.getWorkflow(id);

      const perform = yield* Effect.once(
        Effect.gen(function* () {
          yield* Effect.all(
            Object.values(self.tasks).map((task) =>
              task.maybeCancelOrDisable(id)
            ),
            { concurrency: 'inherit', batching: 'inherit' }
          );
          yield* Effect.all(
            Object.values(self.conditions).map((condition) =>
              condition.cancel(id)
            ),
            { concurrency: 'inherit', batching: 'inherit' }
          );
          yield* stateManager.updateWorkflowState(id, 'failed');
          if (self.parentTask && workflow.parent?.workflowId) {
            yield* self.parentTask.maybeFail(workflow.parent.workflowId);
          }
        }).pipe(
          Effect.provideService(State, stateManager),
          Effect.provideService(ExecutionContext, executionContext)
        )
      );

      yield* self.activities.onFail(
        {
          ...defaultActivityPayload,
          failWorkflow() {
            return pipe(
              perform,
              Effect.tap(() => executionContext.emitStateChanges())
            );
          },
        },
        input
      ) as Effect.Effect<unknown>;

      yield* perform;
    });
  }

  getDefaultActivityPayload(id: WorkflowId) {
    return Effect.gen(function* () {
      const stateManager = yield* State;
      const executionContext = yield* ExecutionContext;
      const workflow = yield* stateManager.getWorkflow(id);

      return {
        getParentWorkflowContext() {
          return Effect.gen(function* () {
            const parent = workflow.parent;
            if (!parent) {
              return yield* Effect.fail(
                new ParentWorkflowDoesNotExist({
                  workflowId: id,
                  workflowName: workflow.name,
                })
              );
            }
            return yield* stateManager.getWorkflowContext(parent.workflowId);
          });
        },
        updateParentWorkflowContext(contextOrUpdater: unknown) {
          return Effect.gen(function* () {
            const parent = workflow.parent;
            if (!parent) {
              return yield* Effect.fail(
                new ParentWorkflowDoesNotExist({
                  workflowId: id,
                  workflowName: workflow.name,
                })
              );
            }
            if (typeof contextOrUpdater === 'function') {
              const context = yield* stateManager.getWorkflowContext(
                parent.workflowId
              );
              return yield* stateManager.updateWorkflowContext(
                parent.workflowId,
                contextOrUpdater(context)
              );
            }
            return yield* stateManager.updateWorkflowContext(
              parent.workflowId,
              contextOrUpdater
            );
          });
        },
        getWorkflowContext() {
          return Effect.gen(function* () {
            return (yield* stateManager.getWorkflowContext(id)) as Context;
          });
        },
        updateWorkflowContext(contextOrUpdater: unknown) {
          return Effect.gen(function* () {
            if (typeof contextOrUpdater === 'function') {
              const context = yield* stateManager.getWorkflowContext(id);
              return yield* stateManager
                .updateWorkflowContext(id, contextOrUpdater(context))
                .pipe(Effect.tap(() => executionContext.emitStateChanges()));
            }
            return yield* stateManager
              .updateWorkflowContext(id, contextOrUpdater)
              .pipe(Effect.tap(() => executionContext.emitStateChanges()));
          });
        },
      };
    });
  }

  getStartCondition() {
    const startCondition = this.startCondition;
    if (startCondition) {
      return Effect.succeed(startCondition);
    }
    return Effect.fail(
      new StartConditionDoesNotExist({ workflowName: this.name })
    );
  }
  getEndCondition() {
    const endCondition = this.endCondition;
    if (endCondition) {
      return Effect.succeed(endCondition);
    }
    return Effect.fail(
      new EndConditionDoesNotExist({ workflowName: this.name })
    );
  }
  getCondition(conditionName: string) {
    const condition = this.conditions[conditionName];
    if (condition) {
      return Effect.succeed(condition);
    }
    return Effect.fail(
      new ConditionDoesNotExist({ workflowName: this.name, conditionName })
    );
  }
  getTask(taskName: string) {
    const task = this.tasks[taskName];
    if (task) {
      return Effect.succeed(task);
    }
    return Effect.fail(
      new TaskDoesNotExist({ workflowName: this.name, taskName })
    );
  }
  getState(id: WorkflowId) {
    return Effect.gen(function* () {
      const stateManager = yield* State;
      return yield* stateManager.getWorkflow(id);
    });
  }
  getTasks(id: WorkflowId) {
    return Effect.gen(function* () {
      const stateManager = yield* State;
      return yield* stateManager.getTasks(id);
    });
  }
  getConditions(id: WorkflowId) {
    return Effect.gen(function* () {
      const stateManager = yield* State;
      return yield* stateManager.getConditions(id);
    });
  }
  isOrJoinSatisfied(id: WorkflowId, task: BaseTask) {
    const self = this;
    return Effect.gen(function* () {
      const priorConditions = Array.from(task.incomingFlows).flatMap(
        (f) => f.priorElement
      );
      const priorConditionsMarkings = yield* Effect.all(
        priorConditions.map((c) => c.getMarking(id))
      );

      // This is handling the case where isOrJoinSatisfied is called as a result of
      // task completion. Previously, Task.isJoinSatisfied was only called as a result
      // of a condition increment, which ensured that at least one condition had a positive marking.
      // This is not the case when a task is completed, so we need to check that at least one
      // condition has a positive marking, otherwise we might get false positives
      if (!priorConditionsMarkings.some((m) => m > 0)) {
        return false;
      }

      const stateManager = yield* State;
      const workflowTasks = yield* stateManager.getTasks(id);
      const activeTasks = workflowTasks.reduce<BaseTask[]>((acc, taskData) => {
        if (taskData.state === 'started') {
          const task = self.tasks[taskData.name];
          task && acc.push(task);
        }
        return acc;
      }, []);
      const workflowConditions = yield* stateManager.getConditions(id);
      const enabledConditions = workflowConditions.reduce<Condition[]>(
        (acc, conditionData) => {
          if (conditionData.marking > 0) {
            const condition = self.conditions[conditionData.name];
            condition && acc.push(condition);
          }
          return acc;
        },
        []
      );

      const marking = new Marking(activeTasks, enabledConditions);

      const e2wfojnet = new E2WFOJNet(
        Object.values(self.tasks),
        Object.values(self.conditions),
        task
      );

      e2wfojnet.restrictNet(marking);
      e2wfojnet.restrictNet(task);

      return e2wfojnet.orJoinEnabled(marking, task);
    });
  }
  isEndReached(id: WorkflowId) {
    const self = this;
    return Effect.gen(function* () {
      const endCondition = yield* self.getEndCondition();
      const endConditionMarking = yield* endCondition.getMarking(id);

      if (endConditionMarking > 0) {
        return true;
      }

      return false;
    });
  }
}
