import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import * as TB from '../builder/TaskBuilder.js';
import { E2WFOJNet } from '../e2wfojnet.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  WorkflowNotInitialized,
} from '../errors.js';
import { StateManager } from '../stateManager/types.js';
import { WorkflowOnEndPayload, WorkflowOnStartPayload } from '../types.js';
import { Condition } from './Condition.js';
import { Marking } from './Marking.js';
import { Task } from './Task.js';

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

export class Workflow<
  _R = never,
  _E = never,
  Context extends object = object,
  _WorkflowTaskActivitiesOutputs extends Record<
    string,
    TB.ActivitiesReturnType
  > = Record<string, TB.ActivitiesReturnType>,
  _OnStartReturnType = unknown
> {
  readonly tasks: Record<string, Task> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly stateManager: StateManager,
    readonly onStart: (
      payload: WorkflowOnStartPayload<Context>
    ) => Effect.Effect<unknown, unknown, unknown>,
    readonly onEnd: (
      payload: WorkflowOnEndPayload<Context>
    ) => Effect.Effect<unknown, unknown, unknown>
  ) {}

  addTask(task: Task) {
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
    return Effect.fail(ConditionDoesNotExist());
  }

  setEndCondition(conditionName: string) {
    if (this.conditions[conditionName]) {
      this.endCondition = this.conditions[conditionName];
      return Effect.succeed(this.endCondition);
    }
    return Effect.fail(ConditionDoesNotExist());
  }

  initialize(): Effect.Effect<never, never, void> {
    return this.stateManager.initializeWorkflow(this);
  }

  end(): Effect.Effect<never, WorkflowNotInitialized, void> {
    return this.stateManager.updateWorkflowState(this, 'done');
  }

  cancel(
    context: object
  ): Effect.Effect<never, WorkflowNotInitialized, unknown> {
    return pipe(
      Effect.allDiscard([
        Effect.allPar(
          Object.values(this.tasks).map((task) => task.cancel(context))
        ),
        Effect.allPar(
          Object.values(this.conditions).map((condition) =>
            condition.cancel(context)
          )
        ),
      ]),
      Effect.tap(() => this.stateManager.updateWorkflowState(this, 'canceled'))
    );
  }

  getStartCondition() {
    const startCondition = this.startCondition;
    if (startCondition) {
      return Effect.succeed(startCondition);
    }
    return Effect.fail(StartConditionDoesNotExist());
  }
  getEndCondition() {
    const endCondition = this.endCondition;
    if (endCondition) {
      return Effect.succeed(endCondition);
    }
    return Effect.fail(EndConditionDoesNotExist());
  }
  getCondition(name: string) {
    const condition = this.conditions[name];
    if (condition) {
      return Effect.succeed(condition);
    }
    return Effect.fail(ConditionDoesNotExist());
  }
  getTask(name: string) {
    const task = this.tasks[name];
    if (task) {
      return Effect.succeed(task);
    }
    return Effect.fail(TaskDoesNotExist());
  }
  getState() {
    return this.stateManager.getWorkflowState(this.id);
  }
  isOrJoinSatisfied(task: Task) {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(self.getState());
      const activeTasks = Object.values(workflowState.tasks).reduce<Task[]>(
        (acc, taskData) => {
          if (taskData.state === 'active') {
            const task = self.tasks[taskData.name];
            task && acc.push(task);
          }
          return acc;
        },
        []
      );
      const enabledConditions = Object.values(workflowState.conditions).reduce<
        Condition[]
      >((acc, conditionData) => {
        if (conditionData.marking > 0) {
          const condition = self.conditions[conditionData.name];
          condition && acc.push(condition);
        }
        return acc;
      }, []);

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
  isEndReached() {
    const self = this;
    return Effect.gen(function* ($) {
      const endCondition = yield* $(self.getEndCondition());
      const endConditionMarking = yield* $(endCondition.getMarking());

      if (endConditionMarking > 0) {
        return true;
      }

      return false;
    });
  }
}
