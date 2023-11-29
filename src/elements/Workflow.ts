import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import { E2WFOJNet } from '../e2wfojnet.js';
import {
  ConditionDoesNotExist,
  ConditionDoesNotExistInStore,
  EndConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkflowStateTransition,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  TaskDoesNotExistInStore,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ConditionName,
  ExecutionContext,
  TaskName,
  WorkflowId,
  WorkflowInstanceParent,
  WorkflowOnEndPayload,
  WorkflowOnStartPayload,
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

type OnStart<C> = (
  payload: WorkflowOnStartPayload<C>,
  input?: unknown
) => Effect.Effect<unknown, unknown, unknown>;

type OnEnd<C> = (
  payload: WorkflowOnEndPayload<C>
) => Effect.Effect<unknown, unknown, unknown>;
export class Workflow<
  _R = never,
  _E = never,
  Context = unknown,
  _WorkflowMetadata = object,
  _OnStartReturnType = unknown
> {
  readonly tasks: Record<string, BaseTask> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;
  readonly name: string;
  readonly onStart: OnStart<Context>;
  readonly onEnd: OnEnd<Context>;
  private parentTask?: CompositeTask;

  constructor(name: string, onStart: OnStart<Context>, onEnd: OnEnd<Context>) {
    this.name = name;
    this.onStart = onStart;
    this.onEnd = onEnd;
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
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const taskNames = Object.keys(tasks).map(TaskName);
      const conditionNames = Object.keys(conditions).map(ConditionName);
      return yield* $(
        stateManager.initializeWorkflow(
          {
            name: name,
            tasks: taskNames,
            conditions: conditionNames,
          },
          context,
          parent
        )
      );
    });
  }

  start(id: WorkflowId, input?: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const executionContext = yield* $(ExecutionContext);
      const perform = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            const startCondition = yield* $(self.getStartCondition());
            yield* $(
              Effect.succeed(startCondition),
              Effect.tap((s) => s.incrementMarking(id)),
              Effect.tap((s) => s.enableTasks(id))
            );
            yield* $(stateManager.updateWorkflowState(id, 'started'));
          }).pipe(
            Effect.provideService(State, stateManager),
            Effect.provideService(ExecutionContext, executionContext)
          )
        )
      );

      const result = yield* $(
        self.onStart(
          {
            getWorkflowContext() {
              return stateManager
                .getWorkflow(id)
                .pipe(Effect.map((w) => w.context as Context));
            },
            updateWorkflowContext(context: unknown) {
              return stateManager.updateWorkflowContext(id, context);
            },
            startWorkflow() {
              return perform;
            },
          },
          input
        ) as Effect.Effect<never, never, unknown>
      );

      yield* $(perform);

      return result;
    });
  }

  complete(
    id: WorkflowId
  ): Effect.Effect<
    State | ExecutionContext,
    | ConditionDoesNotExist
    | WorkflowDoesNotExist
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | InvalidTaskStateTransition
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist,
    void
  > {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const executionContext = yield* $(ExecutionContext);
      const workflow = yield* $(stateManager.getWorkflow(id));
      const perform = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(stateManager.updateWorkflowState(id, 'completed'));
            if (self.parentTask && workflow.parent?.workflowId) {
              yield* $(self.parentTask.maybeExit(workflow.parent.workflowId));
            }
          }).pipe(
            Effect.provideService(State, stateManager),
            Effect.provideService(ExecutionContext, executionContext)
          )
        )
      );

      yield* $(
        self.onEnd({
          getWorkflowContext() {
            return stateManager
              .getWorkflow(id)
              .pipe(Effect.map((w) => w.context as Context));
          },
          updateWorkflowContext(context: unknown) {
            return stateManager.updateWorkflowContext(id, context);
          },
          endWorkflow() {
            return perform;
          },
        }) as Effect.Effect<never, never, unknown>
      );

      yield* $(perform);
    });
  }

  maybeComplete(id: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(self.getState(id));
      const isEndReached = yield* $(self.isEndReached(id));
      if (
        isEndReached &&
        !finalWorkflowInstanceStates.has(workflowState.state)
      ) {
        yield* $(self.complete(id));
      }
    });
  }

  cancel(id: WorkflowId) {
    return pipe(
      Effect.all(
        [
          Effect.all(
            Object.values(this.tasks).map((task) => task.cancel(id)),
            { batching: true }
          ),
          Effect.all(
            Object.values(this.conditions).map((condition) =>
              condition.cancel(id)
            ),
            { batching: true }
          ),
        ],
        { discard: true }
      ),
      Effect.tap(() =>
        Effect.gen(function* ($) {
          const stateManager = yield* $(State);
          yield* $(stateManager.updateWorkflowState(id, 'canceled'));
        })
      )
    );
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
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getWorkflow(id));
    });
  }
  getTasks(id: WorkflowId) {
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getTasks(id));
    });
  }
  getConditions(id: WorkflowId) {
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.getConditions(id));
    });
  }
  isOrJoinSatisfied(id: WorkflowId, task: BaseTask) {
    const self = this;
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      const workflowTasks = yield* $(stateManager.getTasks(id));
      const activeTasks = workflowTasks.reduce<BaseTask[]>((acc, taskData) => {
        if (taskData.state === 'fired') {
          const task = self.tasks[taskData.name];
          task && acc.push(task);
        }
        return acc;
      }, []);
      const workflowConditions = yield* $(stateManager.getConditions(id));
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
    return Effect.gen(function* ($) {
      const endCondition = yield* $(self.getEndCondition());
      const endConditionMarking = yield* $(endCondition.getMarking(id));

      if (endConditionMarking > 0) {
        return true;
      }

      return false;
    });
  }
}
