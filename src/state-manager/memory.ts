import * as Data from '@effect/data/Data';
import { pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';

import type { Condition } from '../Condition.js';
import type { Task } from '../Task.js';
import { InterpreterState, WTaskState } from '../types.js';
import { StateManager } from './types.js';

const INITIAL_STATE: InterpreterState = Data.struct({
  markings: HashMap.empty<string, number>(),
  tasks: HashMap.empty<string, WTaskState>(),
});

export class Memory implements StateManager {
  constructor(private readonly stateRef: Ref.Ref<InterpreterState>) {}

  incrementConditionMarking(condition: Condition) {
    return Ref.update(this.stateRef, (state) =>
      Struct.evolve(state, {
        markings: HashMap.modifyAt(condition.name, (marking) =>
          Option.sum(
            Option.orElse(marking, () => Option.some(0)),
            Option.some(1)
          )
        ),
      })
    );
  }
  decrementConditionMarking(condition: Condition) {
    return Ref.update(this.stateRef, (state) =>
      Struct.evolve(state, {
        markings: HashMap.modifyAt(condition.name, (marking) =>
          pipe(
            marking,
            Option.map((marking) => marking - 1),
            Option.filter((marking) => marking > 0)
          )
        ),
      })
    );
  }
  emptyConditionMarking(condition: Condition) {
    return Ref.update(this.stateRef, (state) => {
      return Struct.evolve(state, {
        markings: HashMap.remove(condition.name),
      }) as InterpreterState;
    });
  }
  getConditionMarking(condition: Condition) {
    return pipe(
      Ref.get(this.stateRef),
      Effect.map((state) =>
        pipe(
          state.markings,
          HashMap.get(condition.name),
          Option.getOrElse(() => 0)
        )
      )
    );
  }

  updateTaskState(task: Task, state: WTaskState) {
    return Ref.update(
      this.stateRef,
      Struct.evolve({
        tasks: HashMap.set(task.name, state),
      })
    );
  }

  enableTask(task: Task) {
    return this.updateTaskState(task, 'enabled');
  }
  disableTask(task: Task) {
    return this.updateTaskState(task, 'disabled');
  }
  activateTask(task: Task) {
    return this.updateTaskState(task, 'active');
  }
  completeTask(task: Task) {
    return this.updateTaskState(task, 'completed');
  }
  cancelTask(task: Task) {
    return this.updateTaskState(task, 'cancelled');
  }
  getTaskState(task: Task) {
    return pipe(
      Ref.get(this.stateRef),
      Effect.map((state) =>
        pipe(
          state.tasks,
          HashMap.get(task.name),
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
