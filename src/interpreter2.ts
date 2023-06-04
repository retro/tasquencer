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
} from './e2wfojnet.js';
import type { CancellationRegion, Net } from './types.js';

export type onStart = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onStart = Context.Tag<onStart>();

export type onActivate = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onActivate = Context.Tag<onActivate>();

export type onComplete = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onComplete = Context.Tag<onComplete>();

export type onCancel = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onCancel = Context.Tag<onCancel>();

interface TaskNotEnabledError extends Data.Case {
  readonly _tag: 'TaskNotEnabledError';
}
const TaskNotEnabledError = Data.tagged<TaskNotEnabledError>(
  'TaskNotEnabledError'
);

interface TaskNotActivatedError extends Data.Case {
  readonly _tag: 'TaskNotActivatedError';
}
const TaskNotActivatedError = Data.tagged<TaskNotActivatedError>(
  'TaskNotActivatedError'
);

const INITIAL_INTERPRETER_STATE = Data.struct({
  markings: HashMap.empty<string, number>(),
  enabledTasks: HashSet.empty<string>(),
  activeTasks: HashSet.empty<string>(),
});

type InterpreterState = typeof INITIAL_INTERPRETER_STATE;
interface JSInterpreterState {
  markings: Record<string, number>;
  enabledTasks: Set<string>;
  activeTasks: Set<string>;
}

function JSInterpreterStateToInterpreterState(
  jsState: JSInterpreterState
): InterpreterState {
  return Data.struct({
    markings: HashMap.fromIterable(Object.entries(jsState.markings)),
    enabledTasks: HashSet.fromIterable(jsState.enabledTasks),
    activeTasks: HashSet.fromIterable(jsState.activeTasks),
  });
}

const isTaskEnabled = dual(2, (state: InterpreterState, taskName: string) =>
  HashSet.has(state.enabledTasks, taskName)
);

const isTaskActivated = dual(2, (state: InterpreterState, taskName: string) =>
  HashSet.has(state.activeTasks, taskName)
);

const getConditionMarking = dual(
  2,
  (state: InterpreterState, condition: string) =>
    pipe(
      state.markings,
      HashMap.get(condition),
      Option.getOrElse(() => 0)
    )
);

const enableTasksForCondition = dual(
  3,
  (state: InterpreterState, net: Net, condition: string) => {
    const marking = pipe(
      state.markings,
      HashMap.get(condition),
      Option.getOrElse(() => 0)
    );

    return Struct.evolve(state, {
      enabledTasks(enabledTasks) {
        if (marking > 0) {
          const flows = net.flows.conditions[condition];
          return HashSet.union(enabledTasks, flows);
        } else {
          return enabledTasks;
        }
      },
    });
  }
);

const getPostTasks = (net: Net, taskName: string) => {
  const postConditions = Object.keys(net.flows.tasks[taskName]);
  const postTasks = R.reduce(
    postConditions,
    (acc, condition) => {
      const conditionPostTasks = HashSet.fromIterable(
        net.flows.conditions[condition]
      );
      return HashSet.union(acc, conditionPostTasks);
    },
    HashSet.empty<string>()
  );
  return postTasks;
};

const incrementConditionMarking = dual(
  2,
  (state: InterpreterState, condition: string) => {
    const marking = pipe(
      state.markings,
      HashMap.get(condition),
      Option.getOrElse(() => 0)
    );

    return Struct.evolve(state, {
      markings: HashMap.set(condition, marking + 1),
    });
  }
);

const disableTask = dual(2, (state: InterpreterState, taskName: string) =>
  Struct.evolve(state, {
    enabledTasks: HashSet.remove(taskName),
  })
);

const activateTask = dual(2, (state: InterpreterState, taskName: string) =>
  Struct.evolve(state, {
    activeTasks: HashSet.add(taskName),
  })
);

const deactivateTask = dual(2, (state: InterpreterState, taskName: string) =>
  Struct.evolve(state, {
    activeTasks: HashSet.remove(taskName),
  })
);

const removeToken = dual(
  4,
  (
    state: InterpreterState,
    net: Net,
    condition: string,
    removeAllTokens = false
  ) => {
    const marking = getConditionMarking(state, condition);

    const newMarking = removeAllTokens ? 0 : marking - 1;

    const newState =
      newMarking > 0
        ? Struct.evolve(state, {
            markings: HashMap.set(condition, newMarking),
          })
        : Struct.evolve(state, {
            markings: HashMap.remove(condition),
          });

    if (newMarking < 1) {
      return Array.from(net.flows.conditions[condition].values()).reduce(
        (state, taskName) => {
          return disableTask(state, taskName);
        },
        newState
      );
    }
    return newState;
  }
);

const consumeTokensFromIncomingFlows = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const flows = net.incomingFlows.tasks[taskName];
    return Array.from(flows).reduce((state, condition) => {
      return removeToken(state, net, condition, true);
    }, state);
  }
);

const produceTokenInCondition = dual(
  2,
  (state: InterpreterState, condition: string) =>
    Struct.evolve(state, {
      markings: HashMap.modifyAt(condition, (o) =>
        Option.match(
          o,
          () => Option.some(1),
          (v) => Option.some(v + 1)
        )
      ),
    })
);

const produceOrSplitTokensInOutgoingFlows = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const flows = Object.entries(net.flows.tasks[taskName]);

    return flows.reduce((state, [condition, flow]) => {
      if (flow.isDefault) {
        return produceTokenInCondition(state, condition);
      } else {
        const result = flow.predicate ? flow.predicate(null, net) : false;
        if (result) {
          return produceTokenInCondition(state, condition);
        }
      }
      return state;
    }, state);
  }
);

const produceXorSplitTokensInOutgoingFlows = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const flows = R.sortBy(
      Object.entries(net.flows.tasks[taskName]),
      ([_conditionName, flow]) => {
        return flow.order ?? Infinity;
      }
    );
    for (const [condition, flow] of flows) {
      if (flow.isDefault) {
        return produceTokenInCondition(state, condition);
      } else {
        const result = flow.predicate ? flow.predicate(null, net) : false;
        if (result) {
          return produceTokenInCondition(state, condition);
        }
      }
    }
    return state;
  }
);

const produceAndSplitTokensInOutgoingFlows = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const conditions = Object.entries(net.flows.tasks[taskName]);
    return conditions.reduce((state, [condition]) => {
      return produceTokenInCondition(state, condition);
    }, state);
  }
);

const produceTokensInOutgoingFlows = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const task = net.tasks[taskName];
    switch (task.splitType) {
      case 'or':
        return produceOrSplitTokensInOutgoingFlows(state, net, taskName);
      case 'xor':
        return produceXorSplitTokensInOutgoingFlows(state, net, taskName);
      default:
        return produceAndSplitTokensInOutgoingFlows(state, net, taskName);
    }
  }
);

const cancelTaskCancellationRegion = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const cancellationRegion = net.cancellationRegions[taskName];
    if (cancellationRegion) {
      const newState = cancellationRegion.tasks?.reduce((state, taskName) => {
        return deactivateTask(state, taskName);
      }, state);
      return cancellationRegion.conditions?.reduce((state, condition) => {
        if (getConditionMarking(state, condition) > 0) {
          return removeToken(state, net, condition, true);
        }
        return state;
      }, newState);
    }
    return state;
  }
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

const getActiveTasks = (state: InterpreterState) => {
  return new Set(state.activeTasks);
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

const isJoinSatisfied = (
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

const enablePostTasks = dual(
  3,
  (state: InterpreterState, net: Net, taskName: string) => {
    const postTasks = getPostTasks(net, taskName);
    return HashSet.reduce(postTasks, state, (state, postTaskName) => {
      if (isJoinSatisfied(state, net, postTaskName)) {
        return Struct.evolve(state, {
          enabledTasks: HashSet.add(postTaskName),
        });
      }
      return state;
    });
  }
);

export class Interpreter {
  constructor(
    private net: Net,
    private stateRef: Ref.Ref<InterpreterState>,
    private onStart: Option.Option<onStart>,
    private onActivate: Option.Option<onActivate>,
    private onComplete: Option.Option<onComplete>
  ) {}
  start() {
    const startCondition = this.net.startCondition;

    return pipe(
      Effect.succeed(this.stateRef),
      Effect.flatMap((stateRef) =>
        Ref.updateAndGet(stateRef, (state) =>
          pipe(
            state,
            incrementConditionMarking(startCondition),
            enableTasksForCondition(this.net, startCondition)
          )
        )
      ),
      Effect.tap((state) =>
        Option.match(
          this.onStart,
          () => Effect.unit(),
          (f) => f(state)
        )
      ),
      Effect.map(() => this)
    );
  }

  resume(state: InterpreterState) {
    return pipe(
      Effect.succeed(this.stateRef),
      Effect.flatMap((stateRef) => Ref.set(stateRef, state)),
      Effect.map(() => this)
    );
  }

  resumeFromJSState(state: JSInterpreterState) {
    return this.resume(JSInterpreterStateToInterpreterState(state));
  }

  activateTask(taskName: string) {
    return pipe(
      this.getState(),
      Effect.map((state) => isTaskEnabled(state, taskName)),
      Effect.ifEffect(
        pipe(
          Effect.succeed(this.stateRef),
          Effect.flatMap((stateRef) =>
            Ref.updateAndGet(stateRef, (state) =>
              pipe(
                state,
                disableTask(taskName),
                activateTask(taskName),
                consumeTokensFromIncomingFlows(this.net, taskName)
              )
            )
          ),
          Effect.tap((state) =>
            Option.match(
              this.onActivate,
              () => Effect.unit(),
              (f) => f(state)
            )
          ),
          Effect.map(() => this)
        ),
        Effect.fail(TaskNotEnabledError())
      )
    );
  }
  completeTask(taskName: string) {
    return pipe(
      this.getState(),
      Effect.map((state) => isTaskActivated(state, taskName)),
      Effect.ifEffect(
        pipe(
          Effect.succeed(this.stateRef),
          Effect.flatMap((stateRef) =>
            Ref.updateAndGet(stateRef, (state) =>
              pipe(
                state,
                deactivateTask(taskName),
                produceTokensInOutgoingFlows(this.net, taskName),
                enablePostTasks(this.net, taskName),
                cancelTaskCancellationRegion(this.net, taskName)
              )
            )
          ),
          Effect.tap((state) =>
            Option.match(
              this.onComplete,
              () => Effect.unit(),
              (f) => f(state)
            )
          ),
          Effect.map(() => this)
        ),
        Effect.fail(TaskNotActivatedError())
      )
    );
  }
  getState() {
    return Ref.get(this.stateRef);
  }
  getJSState() {
    return pipe(
      this.getState(),
      Effect.map((state) => {
        return {
          markings: Object.fromEntries(state.markings),
          enabledTasks: new Set(state.enabledTasks),
          activeTasks: new Set(state.activeTasks),
        };
      })
    );
  }
}

export function makeInterpreter(net: Net) {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(
      Ref.make<InterpreterState>(INITIAL_INTERPRETER_STATE)
    );

    const onStartCb = yield* $(Effect.serviceOption(onStart));
    const onActivateCb = yield* $(Effect.serviceOption(onActivate));
    const onCompleteCb = yield* $(Effect.serviceOption(onComplete));
    /*const onCancelCb = yield* $(Effect.serviceOption(onCancel));*/

    return new Interpreter(
      net,
      stateRef,
      onStartCb,
      onActivateCb,
      onCompleteCb
    );
  });
}
