import { Effect, pipe } from 'effect';

import { State } from '../State.js';
import * as TB from '../builder/TaskBuilder.js';
import { E2WFOJNet } from '../e2wfojnet.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
} from '../errors.js';
import {
  ConditionName,
  TaskName,
  WorkflowId,
  WorkflowInstanceParent,
  WorkflowOnEndPayload,
  WorkflowOnStartPayload,
} from '../types.js';
import { BaseTask } from './BaseTask.js';
import { Condition } from './Condition.js';
import { Marking } from './Marking.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkflowTasksActivitiesOutputs<T> = T extends Workflow<
  any,
  any,
  object,
  infer U
>
  ? U
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

type OnStart<C> = (
  payload: WorkflowOnStartPayload<C>
) => Effect.Effect<unknown, unknown, unknown>;

type OnEnd<C> = (
  payload: WorkflowOnEndPayload<C>
) => Effect.Effect<unknown, unknown, unknown>;
export class Workflow<
  _R = never,
  _E = never,
  Context extends object = object,
  _WorkflowTaskActivitiesOutputs extends Record<
    string,
    TB.TaskActivitiesReturnType
  > = Record<string, TB.TaskActivitiesReturnType>,
  _OnStartReturnType = unknown
> {
  readonly tasks: Record<string, BaseTask> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;
  readonly name: string;
  readonly onStart: OnStart<Context>;
  readonly onEnd: OnEnd<Context>;

  constructor(name: string, onStart: OnStart<Context>, onEnd: OnEnd<Context>) {
    //this.id = WorkflowInstanceId(id);
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

  initialize(parent: WorkflowInstanceParent = null) {
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
          parent
        )
      );
    });
  }

  end(id: WorkflowId) {
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return yield* $(stateManager.updateWorkflowState(id, 'exited'));
    });
  }

  cancel(id: WorkflowId, context: object) {
    return pipe(
      Effect.all(
        [
          Effect.all(
            Object.values(this.tasks).map((task) => task.cancel(id, context)),
            { batching: true }
          ),
          Effect.all(
            Object.values(this.conditions).map((condition) =>
              condition.cancel(id, context)
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
