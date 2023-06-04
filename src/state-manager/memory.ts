import * as Equal from '@effect/data/Equal';
import { dual, pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as HashSet from '@effect/data/HashSet';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';
import * as R from 'remeda';

import { isJoinSatisfied } from '../interpreter/predicates.js';
import { Net } from '../types.js';
import { StateManager } from './types.js';

export type InterpreterState = Readonly<{
  markings: HashMap.HashMap<string, number>;
  enabledTasks: HashSet.HashSet<string>;
  activeTasks: HashSet.HashSet<string>;
}> &
  Equal.Equal;

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

const getConditionMarking = dual(
  2,
  (state: InterpreterState, condition: string) =>
    pipe(
      state.markings,
      HashMap.get(condition),
      Option.getOrElse(() => 0)
    )
);

const enableTask = dual(2, (state: InterpreterState, taskName: string) =>
  Struct.evolve(state, {
    enabledTasks: HashSet.add(taskName),
  })
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

function removeToken(
  stateRef: Ref.Ref<InterpreterState>,
  net: Net,
  condition: string,
  removeAllTokens = false
) {
  return Effect.gen(function* ($) {
    const state = yield* $(Ref.get(stateRef));
    const marking = getConditionMarking(state, condition);

    if (marking > 0) {
      const newMarking = removeAllTokens ? 0 : marking - 1;

      yield* $(
        Ref.update(stateRef, (state) => {
          return newMarking > 0
            ? (Struct.evolve(state, {
                markings: HashMap.set(condition, newMarking),
              }) as InterpreterState)
            : (Struct.evolve(state, {
                markings: HashMap.remove(condition),
              }) as InterpreterState);
        })
      );

      if (newMarking < 1) {
        const flows = net.flows.conditions[condition];
        const updates = Array.from(flows).map((flow) => {
          return pipe(Ref.update(stateRef, disableTask(flow)));
        });
        yield* $(Effect.allParDiscard(updates));
      }
    }
  });
}

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

function produceOrSplitTokensInOutgoingFlows(
  stateRef: Ref.Ref<InterpreterState>,
  net: Net,
  taskName: string
) {
  const flows = Object.entries(net.flows.tasks[taskName]);

  const updates = flows.map(([condition, flow]) => {
    if (flow.isDefault) {
      return pipe(Ref.update(stateRef, produceTokenInCondition(condition)));
    } else if (flow.predicate ? flow.predicate(null, net) : false) {
      return pipe(Ref.update(stateRef, produceTokenInCondition(condition)));
    }
    return Effect.unit();
  });

  return Effect.allParDiscard(updates);
}

function getFirstValidCondition(net: Net, taskName: string) {
  const flows = R.sortBy(
    Object.entries(net.flows.tasks[taskName]),
    ([_conditionName, flow]) => {
      return flow.order ?? Infinity;
    }
  );
  for (const [condition, flow] of flows) {
    if (flow.isDefault) {
      return condition;
    } else {
      const result = flow.predicate ? flow.predicate(null, net) : false;
      if (result) {
        return condition;
      }
    }
  }
  return null;
}

function produceXorSplitTokensInOutgoingFlows(
  stateRef: Ref.Ref<InterpreterState>,
  net: Net,
  taskName: string
) {
  const firstMatchingCondition = getFirstValidCondition(net, taskName);
  return firstMatchingCondition
    ? pipe(
        Ref.update(stateRef, produceTokenInCondition(firstMatchingCondition))
      )
    : Effect.unit();
}

function produceAndSplitTokensInOutgoingFlows(
  stateRef: Ref.Ref<InterpreterState>,
  net: Net,
  taskName: string
) {
  const conditions = Object.entries(net.flows.tasks[taskName]);
  const updates = conditions.map(([condition]) => {
    return pipe(Ref.update(stateRef, produceTokenInCondition(condition)));
  });
  return Effect.allParDiscard(updates);
}

export class Memory implements StateManager {
  constructor(private net: Net, private stateRef: Ref.Ref<InterpreterState>) {}
  resume(state: InterpreterState) {
    return Ref.set(this.stateRef, state);
  }
  incrementConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) => {
      const marking = pipe(
        state.markings,
        HashMap.get(condition),
        Option.getOrElse(() => 0)
      );
      return Struct.evolve(state, {
        markings: HashMap.set(condition, marking + 1),
      });
    });
  }
  enableTasksForCondition(
    condition: string
  ): Effect.Effect<never, never, void> {
    const { net, stateRef } = this;

    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));

      const marking = pipe(
        state.markings,
        HashMap.get(condition),
        Option.getOrElse(() => 0)
      );

      if (marking > 0) {
        const flows = net.flows.conditions[condition];
        const updates = Array.from(flows).map((flow) => {
          return pipe(Ref.update(stateRef, enableTask(flow)));
        });
        yield* $(Effect.allParDiscard(updates));
      }
    });
  }
  disableTask(taskName: string) {
    return Ref.update(this.stateRef, disableTask(taskName));
  }
  activateTask(taskName: string) {
    return Ref.update(this.stateRef, activateTask(taskName));
  }
  deactivateTask(taskName: string) {
    return Ref.update(this.stateRef, deactivateTask(taskName));
  }
  consumeTokensFromIncomingFlows(taskName: string) {
    const { net } = this;
    const flows = this.net.incomingFlows.tasks[taskName];
    const updates = Array.from(flows).map((condition) => {
      return removeToken(this.stateRef, net, condition, true);
    });
    return Effect.allParDiscard(updates);
  }
  produceTokensInOutgoingFlows(taskName: string) {
    const task = this.net.tasks[taskName];
    switch (task.splitType) {
      case 'or':
        return produceOrSplitTokensInOutgoingFlows(
          this.stateRef,
          this.net,
          taskName
        );
      case 'xor':
        return produceXorSplitTokensInOutgoingFlows(
          this.stateRef,
          this.net,
          taskName
        );
      default:
        return produceAndSplitTokensInOutgoingFlows(
          this.stateRef,
          this.net,
          taskName
        );
    }
  }
  enablePostTasks(taskName: string) {
    const postTasks = getPostTasks(this.net, taskName);
    const updates = Array.from(postTasks).map((postTaskName) => {
      return pipe(
        this.getState(),
        Effect.flatMap((state) => {
          return isJoinSatisfied(state, this.net, postTaskName)
            ? Ref.update(this.stateRef, enableTask(postTaskName))
            : Effect.unit();
        })
      );
    });
    return Effect.allParDiscard(updates);
  }

  cancelTaskCancellationRegion(taskName: string) {
    const cancellationRegion = this.net.cancellationRegions[taskName];
    if (cancellationRegion) {
      const tasksUpdates =
        cancellationRegion.tasks?.map((taskName) => {
          return Ref.update(this.stateRef, deactivateTask(taskName));
        }) ?? [];

      const conditionsUpdates =
        cancellationRegion.conditions?.map((condition) =>
          removeToken(this.stateRef, this.net, condition)
        ) ?? [];

      return Effect.allParDiscard([...tasksUpdates, ...conditionsUpdates]);
    }
    return Effect.unit();
  }

  getState() {
    return Ref.get(this.stateRef);
  }
}
