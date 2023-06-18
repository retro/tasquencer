import * as Data from '@effect/data/Data';
import * as Effect from '@effect/io/Effect';

import { Condition } from './Condition.js';
import { Task } from './Task.js';

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

export interface ConditionDoesNotExist extends Data.Case {
  readonly _tag: 'ConditionDoesNotExist';
}
export const ConditionDoesNotExist = Data.tagged<ConditionDoesNotExist>(
  'ConditionDoesNotExist'
);

export class Workflow {
  //net: Net;
  readonly tasks: Record<string, Task> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;

  constructor(readonly id: string) {}

  /*constructor1(net: Net) {
    this.net = net;

    Object.values(net.tasks).forEach((task) => {
      const wTask = new Task(this, task);
      this.tasks[wTask.name] = wTask;
    });
    Object.values(net.conditions).forEach((condition) => {
      const wCondition = new Condition(this, condition);
      this.conditions[wCondition.name] = wCondition;
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.startCondition = this.conditions[net.startCondition]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.endCondition = this.conditions[net.endCondition]!;

    Object.entries(net.flows.tasks).forEach(([taskName, flows]) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const wTask = this.tasks[taskName]!;
      Object.entries(flows).forEach(([conditionName, flow]) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const wCondition = this.conditions[conditionName]!;
        wTask.addOutgoingFlow(wCondition, flow);
        wCondition.addIncomingFlow(wTask);
      });
    });

    Object.entries(net.flows.conditions).forEach(([conditionName, flows]) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const wCondition = this.conditions[conditionName]!;
      flows.forEach((flow) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const wTask = this.tasks[flow]!;
        wCondition.addOutgoingFlow(wTask);
        wTask.addIncomingFlow(wCondition);
      });
    });

    Object.entries(net.cancellationRegions).forEach(
      ([task, cancellationRegion]) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const wTask = this.tasks[task]!;

        cancellationRegion.tasks?.forEach((task) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          wTask.addTaskToCancellationRegion(this.tasks[task]!);
        });

        cancellationRegion.conditions?.forEach((condition) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          wTask.addConditionToCancellationRegion(this.conditions[condition]!);
        });
      }
    );
  }*/

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

  initialize() {
    return Effect.unit();
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
  getId = () => {
    if (this.id) {
      return Effect.succeed(this.id);
    }
    return Effect.fail(WorkflowNotInitialized());
  };
}
