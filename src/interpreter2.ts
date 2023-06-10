import * as Data from '@effect/data/Data';
import * as Effect from '@effect/io/Effect';

import { Workflow } from './Workflow.js';
import { StateManager } from './stateManager/types.js';
import type { Net } from './types.js';

/*export type onStart = (
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
export const onCancel = Context.Tag<onCancel>();*/

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

export class Interpreter {
  constructor(private workflow: Workflow, private stateManager: StateManager) {}
  start() {
    const { workflow, stateManager } = this;
    return Effect.gen(function* ($) {
      const id = yield* $(stateManager.initializeWorkflow());
      yield* $(workflow.initialize(id));
      const startCondition = yield* $(workflow.getStartCondition());
      yield* $(startCondition.incrementMarking());
    });
  }
  resume(workflowId: string) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      yield* $(workflow.resume(workflowId));
    });
  }

  activateTask(taskName: string) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      const isEnabled = yield* $(task.isEnabled());
      if (isEnabled) {
        yield* $(task.activate());
      } else {
        yield* $(Effect.fail(TaskNotEnabledError()));
      }
    });
  }
  completeTask(taskName: string) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      const isActive = yield* $(task.isActive());
      if (isActive) {
        yield* $(task.complete());
      } else {
        yield* $(Effect.fail(TaskNotActivatedError()));
      }
    });
  }
  getState() {
    const { workflow, stateManager } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(workflow.getId());
      return yield* $(stateManager.getWorkflowState(workflowID));
    });
  }
}

export function makeInterpreter(net: Net) {
  return Effect.gen(function* ($) {
    const stateManager = yield* $(StateManager);
    const workflow = new Workflow(stateManager, net);

    return new Interpreter(workflow, stateManager);
  });
}
