import * as Data from '@effect/data/Data';
import * as Equal from '@effect/data/Equal';
import { pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as HashSet from '@effect/data/HashSet';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';

import { Net, WTaskState } from '../types.js';
import { StateManager } from './types.js';

export type InterpreterState = Readonly<{
  markings: HashMap.HashMap<string, number>;
  enabledTasks: HashSet.HashSet<string>;
  activeTasks: HashSet.HashSet<string>;
}> &
  Equal.Equal;

const INITIAL_STATE = Data.struct({
  markings: HashMap.empty<string, number>(),
  tasks: HashMap.empty<string, WTaskState>(),
});

type InitialState = typeof INITIAL_STATE;

export class Memory implements StateManager {
  constructor(private readonly stateRef: Ref.Ref<InitialState>) {}
  resume(state: InterpreterState) {
    const activeTasks = HashSet.map(state.activeTasks, (taskName) => {
      return [taskName, 'active'] as [string, WTaskState];
    });
    const enabledTasks = HashSet.map(state.enabledTasks, (taskName) => {
      return [taskName, 'enabled'] as [string, WTaskState];
    });

    return Ref.set(
      this.stateRef,
      Data.struct({
        markings: state.markings,
        tasks: HashMap.fromIterable([...activeTasks, ...enabledTasks]),
      })
    );
  }

  incrementConditionMarking(condition: string) {
    return pipe(
      Ref.update(this.stateRef, (state) => {
        return Struct.evolve(state, {
          markings: HashMap.modifyAt(condition, (marking) =>
            Option.sum(
              Option.orElse(marking, () => Option.some(0)),
              Option.some(1)
            )
          ),
        });
      })
    );
  }
  decrementConditionMarking(condition: string) {
    return Ref.update(this.stateRef, (state) => {
      const marking = pipe(
        state.markings,
        HashMap.get(condition),
        Option.getOrElse(() => 0)
      );
      const newMarking = Math.max(marking - 1, 0);
      const update =
        newMarking === 0
          ? HashMap.remove(condition)
          : HashMap.set(condition, newMarking);

      return Struct.evolve(state, {
        markings: update,
      });
    });
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
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(self.stateRef));

      const activeTasks = pipe(
        state.tasks,
        HashMap.filter((taskState) => taskState === 'active'),
        HashMap.keys
      );

      const enabledTasks = pipe(
        state.tasks,
        HashMap.filter((taskState) => taskState === 'enabled'),
        HashMap.keys
      );

      return Data.struct({
        markings: state.markings,
        activeTasks: HashSet.fromIterable(activeTasks),
        enabledTasks: HashSet.fromIterable(enabledTasks),
      });
    });
  }
}

export function createMemory() {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(Ref.make(INITIAL_STATE));

    return new Memory(stateRef);
  });
}
