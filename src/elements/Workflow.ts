import * as Effect from '@effect/io/Effect';

import * as TB from '../builder/TaskBuilder.js';
import {
  ConditionDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
} from '../errors.js';
import { StateManager } from '../stateManager/types.js';
import { Condition } from './Condition.js';
import { Task } from './Task.js';

export type WorkflowTasksActivitiesOutputs<T> = T extends Workflow<
  object,
  infer U
>
  ? U
  : never;

// TODO: implement onStart and onEnd activities
// TODO: persist workflow state (running, done) and name
// TODO: figure out if workflow should end when end condition is reached even
// if there are tokens elsewhere
export class Workflow<
  _Context extends object = object,
  _WorkflowTaskActivitiesOutputs extends Record<
    string,
    TB.ActivityOutput
  > = Record<string, TB.ActivityOutput>
> {
  //net: Net;
  readonly tasks: Record<string, Task> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;

  constructor(readonly id: string, readonly stateManager: StateManager) {}

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
  resume() {
    return Effect.unit();
  }
  getStartCondition() {
    const startCondition = this.startCondition;
    if (startCondition) {
      return Effect.succeed(startCondition);
    }
    return Effect.fail(StartConditionDoesNotExist());
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
}
