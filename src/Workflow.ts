import * as Data from '@effect/data/Data';
import * as Effect from '@effect/io/Effect';

import { Condition } from './Condition.js';
import { Task } from './Task.js';
import { StateManager } from './stateManager/types.js';
import type { Net } from './types.js';

export interface TaskDoesNotExist extends Data.Case {
  readonly _tag: 'TaskDoesNotExist';
}
export const TaskDoesNotExist =
  Data.tagged<TaskDoesNotExist>('TaskDoesNotExist');

export interface StartConditionDoesNotExist extends Data.Case {
  readonly _tag: 'StartConditionDoesNotExist';
}
export const StartConditionDoesNotExist =
  Data.tagged<StartConditionDoesNotExist>('StartConditionDoesNotExist');

export interface WorkflowNotInitialized extends Data.Case {
  readonly _tag: 'WorkflowNotInitialized';
}
export const WorkflowNotInitialized = Data.tagged<WorkflowNotInitialized>(
  'WorkflowNotInitialized'
);

export class Workflow {
  net: Net;
  readonly stateManager: StateManager;
  readonly tasks: Record<string, Task> = {};
  readonly conditions: Record<string, Condition> = {};
  readonly startCondition: Condition;
  readonly endCondition: Condition;
  private id: string | null = null;

  constructor(stateManager: StateManager, net: Net) {
    this.net = net;
    this.stateManager = stateManager;

    Object.values(net.tasks).forEach((task) => {
      const wTask = new Task(stateManager, this, task);
      this.tasks[wTask.name] = wTask;
    });
    Object.values(net.conditions).forEach((condition) => {
      const wCondition = new Condition(stateManager, this, condition);
      this.conditions[wCondition.name] = wCondition;
    });

    this.startCondition = this.conditions[net.startCondition];
    this.endCondition = this.conditions[net.endCondition];

    Object.entries(net.flows.tasks).forEach(([taskName, flows]) => {
      const wTask = this.tasks[taskName];
      Object.entries(flows).forEach(([conditionName, flow]) => {
        const wCondition = this.conditions[conditionName];
        wTask.addOutgoingFlow(wCondition, flow);
        wCondition.addIncomingFlow(wTask);
      });
    });

    Object.entries(net.flows.conditions).forEach(([conditionName, flows]) => {
      const wCondition = this.conditions[conditionName];
      flows.forEach((flow) => {
        const wTask = this.tasks[flow];
        wCondition.addOutgoingFlow(wTask);
        wTask.addIncomingFlow(wCondition);
      });
    });

    Object.entries(net.cancellationRegions).forEach(
      ([task, cancellationRegion]) => {
        const wTask = this.tasks[task];

        cancellationRegion.tasks?.forEach((task) => {
          wTask.addTaskToCancellationRegion(this.tasks[task]);
        });

        cancellationRegion.conditions?.forEach((condition) => {
          wTask.addConditionToCancellationRegion(this.conditions[condition]);
        });
      }
    );
  }
  initialize(id: string) {
    this.id = id;
    return Effect.unit();
  }
  resume(id: string) {
    this.id = id;
    return Effect.unit();
  }
  getStartCondition() {
    if (this.startCondition) {
      return Effect.succeed(this.startCondition);
    }
    return Effect.fail(StartConditionDoesNotExist());
  }
  getTask(name: string) {
    if (this.tasks[name]) {
      return Effect.succeed(this.tasks[name]);
    }
    return Effect.fail(TaskDoesNotExist());
  }
  getID = () => {
    if (this.id) {
      return Effect.succeed(this.id);
    }
    return Effect.fail(WorkflowNotInitialized());
  };
}
