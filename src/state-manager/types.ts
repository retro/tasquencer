import * as Effect from '@effect/io/Effect';

import { InterpreterState } from '../types.js';

export interface StateManager {
  incrementConditionMarking(
    condition: string
  ): Effect.Effect<never, never, void>;
  enableTasksForCondition(condition: string): Effect.Effect<never, never, void>;
  disableTask(taskName: string): Effect.Effect<never, never, void>;
  activateTask(taskName: string): Effect.Effect<never, never, void>;
  deactivateTask(taskName: string): Effect.Effect<never, never, void>;
  consumeTokensFromIncomingFlows(
    taskName: string
  ): Effect.Effect<never, never, void>;
  produceTokensInOutgoingFlows(
    taskName: string
  ): Effect.Effect<never, never, void>;
  enablePostTasks(taskName: string): Effect.Effect<never, never, void>;
  cancelTaskCancellationRegion(
    taskName: string
  ): Effect.Effect<never, never, void>;
  getState(): Effect.Effect<never, never, InterpreterState>;
  resume(state: InterpreterState): Effect.Effect<never, never, void>;
}
