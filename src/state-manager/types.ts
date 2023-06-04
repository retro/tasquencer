import * as Effect from '@effect/io/Effect';

import { InterpreterState } from '../types.js';

export interface StateManager {
  incrementConditionMarking(
    condition: string
  ): Effect.Effect<never, never, void>;
  decrementConditionMarking(
    condition: string
  ): Effect.Effect<never, never, void>;
  emptyConditionMarking(condition: string): Effect.Effect<never, never, void>;
  getConditionMarking(condition: string): Effect.Effect<never, never, number>;

  enableTask(taskName: string): Effect.Effect<never, never, void>;
  disableTask(taskName: string): Effect.Effect<never, never, void>;
  activateTask(taskName: string): Effect.Effect<never, never, void>;
  deactivateTask(taskName: string): Effect.Effect<never, never, void>;

  getState(): Effect.Effect<never, never, InterpreterState>;
  resume(state: InterpreterState): Effect.Effect<never, never, void>;
}
