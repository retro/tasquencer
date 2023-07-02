import * as Effect from '@effect/io/Effect';

import { ActivityOutput } from './builder/TaskBuilder.js';
import {
  Workflow,
  WorkflowTasksActivitiesOutputs,
} from './elements/Workflow.js';
import { TaskNotActivatedError, TaskNotEnabledError } from './errors.js';
import { StateManager } from './stateManager/types.js';

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
export class Interpreter<
  TasksActivitiesOutputs extends Record<string, ActivityOutput>
> {
  constructor(
    private workflow: Workflow,
    private stateManager: StateManager,
    private context: object
  ) {}
  start() {
    const { workflow, context } = this;
    return Effect.gen(function* ($) {
      yield* $(workflow.initialize());
      const startCondition = yield* $(workflow.getStartCondition());
      yield* $(startCondition.incrementMarking(context));
    });
  }
  resume() {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      yield* $(workflow.resume());
    });
  }

  activateTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    const { workflow, context } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      const isEnabled = yield* $(task.isEnabled());
      if (!isEnabled) {
        yield* $(Effect.fail(TaskNotEnabledError()));
      }
      const output = yield* $(task.activate(context, input));
      return output as unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onActivate']
        ? I
        : TasksActivitiesOutputs[T]['onActivate'];
    });
  }

  completeTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    const { workflow, context } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      const isActive = yield* $(task.isActive());
      if (!isActive) {
        yield* $(Effect.fail(TaskNotActivatedError()));
      }
      const output = yield* $(task.complete(context, input));
      return output as unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onComplete']
        ? I
        : TasksActivitiesOutputs[T]['onComplete'];
    });
  }

  getState() {
    const { workflow, stateManager } = this;
    return Effect.gen(function* ($) {
      return yield* $(stateManager.getWorkflowState(workflow));
    });
  }
}

export function make<
  W extends Workflow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends W extends Workflow<infer WC> ? WC : object
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const stateManager = yield* $(StateManager);

    return new Interpreter<
      WorkflowTasksActivitiesOutputs<W>
    >(workflow, stateManager, context);
  });
}
