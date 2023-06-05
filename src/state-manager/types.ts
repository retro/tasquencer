import * as Context from '@effect/data/Context';
import * as Effect from '@effect/io/Effect';

import { InterpreterState, WTaskState } from '../types.js';

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
  cancelTask(taskName: string): Effect.Effect<never, never, void>;
  completeTask(taskName: string): Effect.Effect<never, never, void>;
  getTaskState(taskName: string): Effect.Effect<never, never, WTaskState>;

  getState(): Effect.Effect<never, never, InterpreterState>;
}

export const StateManager = Context.Tag<StateManager>();
