import * as Data from '@effect/data/Data';
import * as Equal from '@effect/data/Equal';
import { pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';

import { InterpreterState, WTaskState } from '../types.js';
import { StateManager } from './types.js';

const INITIAL_STATE: InterpreterState = Data.struct({
  markings: HashMap.empty<string, number>(),
  tasks: HashMap.empty<string, WTaskState>(),
});

export class Memory implements StateManager {
  constructor(private readonly stateRef: Ref.Ref<InterpreterState>) {}

  incrementConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) =>
      Struct.evolve(state, {
        markings: HashMap.modifyAt(condition, (marking) =>
          Option.sum(
            Option.orElse(marking, () => Option.some(0)),
            Option.some(1)
          )
        ),
      })
    );
  }
  decrementConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) =>
      Struct.evolve(state, {
        markings: HashMap.modifyAt(condition, (marking) =>
          pipe(
            marking,
            Option.map((marking) => marking - 1),
            Option.filter((marking) => marking > 0)
          )
        ),
      })
    );
  }
  emptyConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) => {
      return Struct.evolve(state, {
        markings: HashMap.remove(condition),
      }) as InitialState;
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

  updateTaskState(taskName: string, state: WTaskState) {
    return Ref.update(
      this.stateRef,
      Struct.evolve({
        tasks: HashMap.set(taskName, state),
      })
    );
  }

  enableTask(taskName: string) {
    return this.updateTaskState(taskName, 'enabled');
  }
  disableTask(taskName: string) {
    return this.updateTaskState(taskName, 'disabled');
  }
  activateTask(taskName: string) {
    return this.updateTaskState(taskName, 'active');
  }
  completeTask(taskName: string) {
    return this.updateTaskState(taskName, 'completed');
  }
  cancelTask(taskName: string) {
    return this.updateTaskState(taskName, 'cancelled');
  }
  getTaskState(taskName: string) {
    return pipe(
      Ref.get(this.stateRef),
      Effect.map((state) =>
        pipe(
          state.tasks,
          HashMap.get(taskName),
          Option.getOrElse(() => 'disabled' as WTaskState)
        )
      )
    );
  }

  getState() {
    return Ref.get(this.stateRef);
  }
}

export function createMemory(initialState?: InterpreterState) {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(Ref.make(initialState ?? INITIAL_STATE));

    return new Memory(stateRef);
  });
}
