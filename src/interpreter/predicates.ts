import * as Context from '@effect/data/Context';
import * as Data from '@effect/data/Data';
import * as Duration from '@effect/data/Duration';
import * as Equal from '@effect/data/Equal';
import { dual, identity, pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as HashSet from '@effect/data/HashSet';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Layer from '@effect/io/Layer';
import * as Ref from '@effect/io/Ref';
import * as R from 'remeda';

import {
  E2WFOJNet,
  YCondition,
  YExternalNetElement,
  YFlow,
  YMarking,
  YTask,
} from '../e2wfojnet.js';
import type { CancellationRegion, InterpreterState, Net } from '../types.js';

const getActiveTasks = (state: InterpreterState) => {
  return new Set(state.activeTasks);
};

const getMarkings = (state: InterpreterState) => {
  return HashMap.reduceWithIndex(
    state.markings,
    {} as Record<string, number>,
    (state, marking, condition) => {
      if (marking > 0) {
        state[condition] = marking;
      }
      return state;
    }
  );
};

const getConditionMarking = dual(
  2,
  (state: InterpreterState, condition: string) =>
    pipe(
      state.markings,
      HashMap.get(condition),
      Option.getOrElse(() => 0)
    )
);

export const isTaskEnabled = dual(
  2,
  (state: InterpreterState, taskName: string) =>
    HashSet.has(state.enabledTasks, taskName)
);

export const isTaskActivated = dual(
  2,
  (state: InterpreterState, taskName: string) =>
    HashSet.has(state.activeTasks, taskName)
);

const isAndJoinSatisfied = (
  state: InterpreterState,
  incomingFlows: string[]
) => {
  return R.pipe(
    incomingFlows,
    R.map((condition) => getConditionMarking(state, condition) > 0),
    (results) => results.every(R.identity)
  );
};

const isXorJoinSatisfied = (
  state: InterpreterState,
  incomingFlows: string[]
) => {
  const markedConditionCount = R.reduce(
    incomingFlows,
    (acc, condition) => {
      if (getConditionMarking(state, condition) > 0) {
        return acc + 1;
      }
      return acc;
    },
    0
  );

  return markedConditionCount === 1;
};

const isOrJoinSatisfied = (
  state: InterpreterState,
  net: Net,
  orJoinTaskName: string
) => {
  const yTasks = R.reduce(
    Object.entries(net.tasks),
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
    Object.entries(net.conditions),
    (acc, [conditionName]) => {
      acc[conditionName] = new YCondition(conditionName);

      return acc;
    },
    {} as Record<string, YCondition>
  );

  Object.entries(net.flows.tasks).forEach(([taskName, taskFlows]) => {
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

  Object.entries(net.flows.conditions).forEach(
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

  Object.entries(net.cancellationRegions).forEach(
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

  const activeYTasks = Array.from(getActiveTasks(state)).map(
    (taskName) => yTasks[taskName]
  );

  const enabledYConditions = Object.keys(getMarkings(state)).map(
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
};

export const isJoinSatisfied = (
  state: InterpreterState,
  net: Net,
  taskName: string
) => {
  const task = net.tasks[taskName];
  const incomingFlows = Array.from(net.incomingFlows.tasks[taskName]);

  switch (task.joinType) {
    case 'and':
      return isAndJoinSatisfied(state, incomingFlows);
    case 'xor':
      return isXorJoinSatisfied(state, incomingFlows);
    case 'or':
      return isOrJoinSatisfied(state, net, taskName);
    default:
      return getConditionMarking(state, incomingFlows[0]) > 0;
  }
};
