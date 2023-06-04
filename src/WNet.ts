import { WCondition } from './WCondition.js';
import { WTask } from './WTask.js';
import { StateManager } from './state-manager/types.js';
import type { Net } from './types.js';

export class WNet {
  net: Net;
  readonly stateManager: StateManager;
  readonly tasks: Record<string, WTask> = {};
  readonly conditions: Record<string, WCondition> = {};
  readonly startCondition: WCondition;
  readonly endCondition: WCondition;

  constructor(stateManager: StateManager, net: Net) {
    this.net = net;
    this.stateManager = stateManager;

    Object.values(net.tasks).forEach((task) => {
      const wTask = new WTask(stateManager, this, task);
      this.tasks[wTask.name] = wTask;
    });
    Object.values(net.conditions).forEach((condition) => {
      const wCondition = new WCondition(stateManager, this, condition);
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
}
