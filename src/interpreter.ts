/*import * as R from 'remeda';
import invariant from 'tiny-invariant';

import {
  E2WFOJNet,
  YCondition,
  YExternalNetElement,
  YFlow,
  YMarking,
  YTask,
} from './e2wfojnet.js';
import type { CancellationRegion, Net } from './types.js';
import { union } from './util/set.js';

export class Interpreter<Context, BNTasks> {
  private net: Net;
  private context: Context;
  private markings: Record<string, number> = {};
  private enabledTasks = new Set<string>();
  private activeTasks = new Set<string>();

  constructor(net: Net, context: Context) {
    this.net = net;
    this.context = context;
  }

  start() {
    const startCondition = this.net.startCondition;
    this.markings[startCondition] = 1;
    this.enableTasksForCondition(startCondition);
    return this;
  }

  activateTask(taskName: BNTasks & string) {
    invariant(
      this.enabledTasks.has(taskName),
      `Unable to activate task ${taskName} because it's not enabled.`
    );

    this.enabledTasks.delete(taskName);
    this.activeTasks.add(taskName);

    const incomingFlows = this.net.incomingFlows.tasks[taskName];

    Array.from(incomingFlows).forEach((condition) => {
      this.removeToken(condition);
    });

    return this;
  }

  completeTask(taskName: BNTasks & string) {
    invariant(
      this.activeTasks.has(taskName),
      `Unable to complete task ${taskName} because it's not activated.`
    );

    const task = this.net.tasks[taskName];

    this.activeTasks.delete(taskName);
    switch (task.splitType) {
      case 'or':
        this.produceORSplitToken(taskName);
        break;
      case 'xor':
        this.produceXORSplitToken(taskName);
        break;
      default:
        this.produceANDSplitToken(taskName);
    }

    for (const task of this.getPostTasks(taskName)) {
      this.enableTask(task);
    }

    const cancellationRegion = this.net.cancellationRegions[taskName];

    if (cancellationRegion) {
      this.cancelRegion(cancellationRegion);
    }

    return this;
  }

  cancelRegion(cancellationRegion: CancellationRegion) {
    cancellationRegion.tasks?.forEach((taskName) => {
      this.activeTasks.delete(taskName);
    });

    cancellationRegion.conditions?.forEach((conditionName) => {
      if (this.getMarking(conditionName) > 0) {
        this.removeToken(conditionName, true);
      }
    });
  }

  produceORSplitToken(taskName: string) {
    const flows = Object.entries(this.net.flows.tasks[taskName]);

    for (const [condition, flow] of flows) {
      if (flow.isDefault) {
        this.addToken(condition);
      } else {
        const result = flow.predicate
          ? flow.predicate(this.context, this.net)
          : false;
        if (result) {
          this.addToken(condition);
        }
      }
    }
  }

  produceXORSplitToken(taskName: string) {
    const flows = R.sortBy(
      Object.entries(this.net.flows.tasks[taskName]),
      ([_conditionName, flow]) => {
        return flow.order ?? Infinity;
      }
    );
    for (const [condition, flow] of flows) {
      if (flow.isDefault) {
        this.addToken(condition);
        return;
      } else {
        const result = flow.predicate
          ? flow.predicate(this.context, this.net)
          : false;
        if (result) {
          this.addToken(condition);
          return;
        }
      }
    }
  }

  produceANDSplitToken(taskName: string) {
    for (const [condition] of Object.entries(this.net.flows.tasks[taskName])) {
      this.addToken(condition);
    }
  }

  enableTasksForCondition(condition: string) {
    if (this.getMarking(condition)) {
      const flows = this.net.flows.conditions[condition];
      if (flows) {
        for (const task of flows.values()) {
          this.enableTask(task);
        }
      }
    }
    return this;
  }

  enableTask(taskName: string) {
    if (this.isTaskEnabled(taskName)) {
      this.enabledTasks.add(taskName);
    }
    return this;
  }

  isTaskEnabled(taskName: string) {
    const task = this.net.tasks[taskName];
    const incomingFlows = Array.from(this.net.incomingFlows.tasks[taskName]);
    switch (task.joinType) {
      case 'and':
        return this.isANDJoinSatisfied(incomingFlows);
      case 'xor':
        return this.isXORJoinSatisfied(incomingFlows);
      case 'or':
        return this.isORJoinSatisfied(taskName);
      default:
        return this.getMarking(incomingFlows[0]) > 0;
    }
  }

  private removeToken(conditionName: string, removeAllTokens = false) {
    const newTokenCount = removeAllTokens
      ? 0
      : Math.max((this.markings[conditionName] ?? 0) - 1, 0);

    this.markings[conditionName] = newTokenCount;

    if (newTokenCount < 1) {
      for (const task of this.net.flows.conditions[conditionName].values()) {
        this.enabledTasks.delete(task);
      }
    }
  }

  private addToken(conditionName: string) {
    this.markings[conditionName] = (this.markings[conditionName] ?? 0) + 1;
  }

  private isANDJoinSatisfied(incomingFlows: string[]) {
    return R.pipe(
      incomingFlows,
      R.map((condition) => this.getMarking(condition) > 0),
      (results) => results.every(R.identity)
    );
  }

  private isORJoinSatisfied(orJoinTaskName: string) {
    const yTasks = R.reduce(
      Object.entries(this.net.tasks),
      (acc, [taskName, task]) => {
        acc[taskName] = new YTask(
          taskName,
          task.joinType ?? 'and',
          task.splitType ?? 'and'
        );
        return acc;
      },
      {} as Record<string, YTask>
    );

    const yConditions = R.reduce(
      Object.entries(this.net.conditions),
      (acc, [conditionName]) => {
        acc[conditionName] = new YCondition(conditionName);

        return acc;
      },
      {} as Record<string, YCondition>
    );

    Object.entries(this.net.flows.tasks).forEach(([taskName, taskFlows]) => {
      Object.entries(taskFlows).forEach(([conditionName, flow]) => {
        const yTask = yTasks[taskName];
        const yCondition = yConditions[conditionName];
        const yFlow = new YFlow(yTask, yCondition, {
          isDefault: flow.isDefault,
          evalOrdering: flow.order,
        });
        yTask.addPostset(yFlow);
        yCondition.addPreset(yFlow);
      });
    });

    Object.entries(this.net.flows.conditions).forEach(
      ([conditionName, conditionFlows]) => {
        for (const taskName of conditionFlows) {
          const yCondition = yConditions[conditionName];
          const yTask = yTasks[taskName];
          const yFlow = new YFlow(yCondition, yTask);

          yCondition.addPostset(yFlow);
          yTask.addPreset(yFlow);
        }
      }
    );

    Object.entries(this.net.cancellationRegions).forEach(
      ([taskName, cancellationRegion]) => {
        const yTask = yTasks[taskName];

        if (yTask) {
          const removeSet = new Set<YExternalNetElement>();
          cancellationRegion.tasks?.forEach(([canceledTaskName]) => {
            const canceledTask = yTasks[canceledTaskName];
            if (canceledTask) {
              removeSet.add(canceledTask);
              canceledTask.addToCancelledBySet(yTask);
            }
          });
          cancellationRegion.conditions?.forEach(([canceledConditionName]) => {
            const canceledCondition = yTasks[canceledConditionName];
            if (canceledCondition) {
              removeSet.add(canceledCondition);
              canceledCondition.addToCancelledBySet(yTask);
            }
          });
          yTask.setRemoveSet(removeSet);
        }
      }
    );

    const activeYTasks = Array.from(this.getActiveTasks()).map(
      (taskName) => yTasks[taskName]
    );

    const enabledYConditions = Object.keys(this.getMarkings()).map(
      (conditionName) => yConditions[conditionName]
    );

    const yMarking = new YMarking([...activeYTasks, ...enabledYConditions]);

    const orJoinYTask = yTasks[orJoinTaskName];

    const e2wfojnet = new E2WFOJNet(
      Object.values(yTasks),
      Object.values(yConditions),
      orJoinYTask
    );

    e2wfojnet.restrictNet(yMarking);
    e2wfojnet.restrictNet(orJoinYTask);

    return e2wfojnet.orJoinEnabled(yMarking, orJoinYTask);
  }

  private isXORJoinSatisfied(incomingFlows: string[]) {
    const markedConditionCount = R.reduce(
      incomingFlows,
      (acc, condition) => {
        if (this.getMarking(condition) > 0) {
          return acc + 1;
        }
        return acc;
      },
      0
    );

    return markedConditionCount === 1;
  }

  getMarking(condition: string) {
    return this.markings[condition] ?? 0;
  }

  getMarkings() {
    return R.reduce(
      Object.entries(this.markings),
      (acc, [condition, marking]) => {
        if (marking > 0) {
          acc[condition] = marking;
        }
        return acc;
      },
      {} as Record<string, number>
    );
  }

  getPostTasks(taskName: string) {
    const postConditions = Object.keys(this.net.flows.tasks[taskName]);
    const postTasks = R.reduce(
      postConditions,
      (acc, condition) => {
        const conditionPostTasks = this.net.flows.conditions[condition];
        return union(acc, conditionPostTasks);
      },
      new Set<string>()
    );
    return postTasks;
  }

  getEnabledTasks() {
    return new Set(this.enabledTasks);
  }

  getActiveTasks() {
    return new Set(this.activeTasks);
  }
}
*/
