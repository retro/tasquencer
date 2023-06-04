import * as Equal from '@effect/data/Equal';
import { pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as HashSet from '@effect/data/HashSet';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';

import { Net } from '../types.js';
import { StateManager } from './types.js';

export type InterpreterState = Readonly<{
  markings: HashMap.HashMap<string, number>;
  enabledTasks: HashSet.HashSet<string>;
  activeTasks: HashSet.HashSet<string>;
}> &
  Equal.Equal;

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
  decrementConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) => {
      const marking = pipe(
        state.markings,
        HashMap.get(condition),
        Option.getOrElse(() => 0)
      );
      const newMarking = Math.max(marking - 1, 0);

      if (newMarking === 0) {
        return Struct.evolve(state, {
          markings: HashMap.remove(condition),
        }) as InterpreterState;
      } else {
        return Struct.evolve(state, {
          markings: HashMap.set(condition, newMarking),
        }) as InterpreterState;
      }
    });
  }
  emptyConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) => {
      return Struct.evolve(state, {
        markings: HashMap.remove(condition),
      }) as InterpreterState;
    });
  }
  getConditionMarking(condition: string) {
    return pipe(
      Ref.get(this.stateRef),
      Effect.map((state) =>
        pipe(
          state.markings,
          HashMap.get(condition),
          Option.getOrElse(() => 0)
        )
      )
    );
  }

  enableTask(taskName: string) {
    return Ref.update(
      this.stateRef,
      Struct.evolve({
        enabledTasks: HashSet.add(taskName),
      })
    );
  }
  disableTask(taskName: string) {
    return Ref.update(
      this.stateRef,
      Struct.evolve({
        enabledTasks: HashSet.remove(taskName),
      })
    );
  }
  activateTask(taskName: string) {
    return Ref.update(
      this.stateRef,
      Struct.evolve({
        activeTasks: HashSet.add(taskName),
      })
    );
  }
  deactivateTask(taskName: string) {
    return Ref.update(
      this.stateRef,
      Struct.evolve({
        activeTasks: HashSet.remove(taskName),
      })
    );
  }

  getState() {
    return Ref.get(this.stateRef);
  }
}
