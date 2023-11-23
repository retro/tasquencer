import { Effect, pipe } from 'effect';

import * as TB from '../builder/TaskBuilder.js';
import { E2WFOJNet } from '../e2wfojnet.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  InvalidWorkflowStateTransition,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ConditionName,
  StateManager,
  TaskName,
  WorkflowInstanceId,
} from '../state/types.js';
import { WorkflowOnEndPayload, WorkflowOnStartPayload } from '../types.js';
import { Condition } from './Condition.js';
import { Marking } from './Marking.js';
import { Task } from './Task.js';

('../state/types.js');

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
  readonly tasks: Record<string, Task> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;
  readonly id: WorkflowInstanceId;
  readonly name: string;
  readonly stateManager: StateManager;
  readonly onStart: OnStart<Context>;
  readonly onEnd: OnEnd<Context>;

  constructor(
    id: string,
    name: string,
    stateManager: StateManager,
    onStart: OnStart<Context>,
    onEnd: OnEnd<Context>
  ) {
    this.id = WorkflowInstanceId(id);
    this.name = name;
    this.stateManager = stateManager;
    this.onStart = onStart;
    this.onEnd = onEnd;
  }

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
    return Effect.fail(
      new ConditionDoesNotExist({ workflowId: this.id, conditionName })
    );
  }

  setEndCondition(conditionName: string) {
    if (this.conditions[conditionName]) {
      this.endCondition = this.conditions[conditionName];
      return Effect.succeed(this.endCondition);
    }
    return Effect.fail(
      new ConditionDoesNotExist({ workflowId: this.id, conditionName })
    );
  }

  initialize(): Effect.Effect<never, never, void> {
    const taskNames = Object.keys(this.tasks).map(TaskName);
    const conditionNames = Object.keys(this.conditions).map(ConditionName);
    return this.stateManager.initializeWorkflow({
      id: this.id,
      name: this.name,
      tasks: taskNames,
      conditions: conditionNames,
    });
  }

  end(): Effect.Effect<
    never,
    InvalidWorkflowStateTransition | WorkflowDoesNotExist,
    void
  > {
    return this.stateManager.updateWorkflowState(this.id, 'exited');
  }

  cancel(context: object) {
    return pipe(
      Effect.all(
        [
          Effect.all(
            Object.values(this.tasks).map((task) => task.cancel(context)),
            { batching: true }
          ),
          Effect.all(
            Object.values(this.conditions).map((condition) =>
              condition.cancel(context)
            ),
            { batching: true }
          ),
        ],
        { discard: true }
      ),
      Effect.tap(() =>
        this.stateManager.updateWorkflowState(this.id, 'canceled')
      )
    );
  }

  getStartCondition() {
    const startCondition = this.startCondition;
    if (startCondition) {
      return Effect.succeed(startCondition);
    }
    return Effect.fail(new StartConditionDoesNotExist({ workflowId: this.id }));
  }
  getEndCondition() {
    const endCondition = this.endCondition;
    if (endCondition) {
      return Effect.succeed(endCondition);
    }
    return Effect.fail(new EndConditionDoesNotExist({ workflowId: this.id }));
  }
  getCondition(conditionName: string) {
    const condition = this.conditions[conditionName];
    if (condition) {
      return Effect.succeed(condition);
    }
    return Effect.fail(
      new ConditionDoesNotExist({ workflowId: this.id, conditionName })
    );
  }
  getTask(taskName: string) {
    const task = this.tasks[taskName];
    if (task) {
      return Effect.succeed(task);
    }
    return Effect.fail(new TaskDoesNotExist({ workflowId: this.id, taskName }));
  }
  getState() {
    return this.stateManager.getWorkflow(this.id);
  }
  getTasks() {
    return this.stateManager.getTasks(this.id);
  }
  getConditions() {
    return this.stateManager.getConditions(this.id);
  }
  isOrJoinSatisfied(task: Task) {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowTasks = yield* $(self.stateManager.getTasks(self.id));
      const activeTasks = workflowTasks.reduce<Task[]>((acc, taskData) => {
        if (taskData.state === 'fired') {
          const task = self.tasks[taskData.name];
          task && acc.push(task);
        }
        return acc;
      }, []);
      const workflowConditions = yield* $(
        self.stateManager.getConditions(self.id)
      );
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
