import { pipe } from '@effect/data/Function';
import * as Option from '@effect/data/Option';
import * as Effect from '@effect/io/Effect';
import * as Queue from '@effect/io/Queue';
import * as Match from '@effect/match';

import { ActivityOutput } from './builder/TaskBuilder.js';
import {
  Workflow,
  WorkflowTasksActivitiesOutputs,
} from './elements/Workflow.js';
import { TaskNotActivatedError, TaskNotEnabledError } from './errors.js';
import { StateManager } from './stateManager/types.js';
import { TaskActionsService } from './types.js';

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

type QueueItem =
  | { type: 'activate'; taskName: string; input: unknown }
  | { type: 'complete'; taskName: string; input: unknown };
export class Interpreter<
  TasksActivitiesOutputs extends Record<string, ActivityOutput>
> {
  constructor(
    private workflow: Workflow,
    private stateManager: StateManager,
    private context: object,
    private queue: Queue.Queue<QueueItem>
  ) {}
  // TODO: Check if workflow was already started
  start() {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.workflow.initialize());
      const startCondition = yield* $(self.workflow.getStartCondition());
      yield* $(
        Effect.succeed(startCondition),
        Effect.tap((s) => s.incrementMarking()),
        Effect.tap((s) => s.enableTasks(self.context)),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      yield* $(self.runQueue());
    });
  }
  resume() {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      yield* $(workflow.resume());
    });
  }

  private activateTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const isEnabled = yield* $(task.isEnabled());
      if (!isEnabled) {
        yield* $(Effect.fail(TaskNotEnabledError()));
      }
      const output: unknown = yield* $(
        task.activate(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    });
  }

  activateTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.activateTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());

      return output as unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onActivate']
        ? I
        : TasksActivitiesOutputs[T]['onActivate'];
    });
  }

  private completeTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const isActive = yield* $(task.isActive());
      if (!isActive) {
        yield* $(Effect.fail(TaskNotActivatedError()));
      }
      const output: unknown = yield* $(
        task.complete(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    });
  }

  completeTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.completeTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());

      return output as unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onComplete']
        ? I
        : TasksActivitiesOutputs[T]['onComplete'];
    });
  }

  private getTaskActionsService() {
    const { queue } = this;
    return {
      activateTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'activate', taskName, input }),
          Effect.asUnit
        );
      },
      completeTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'complete', taskName, input }),
          Effect.asUnit
        );
      },
    };
  }

  private runQueue() {
    const self = this;
    return Effect.gen(function* ($) {
      while (true) {
        const item = yield* $(
          Queue.poll(self.queue),
          Effect.map(Option.getOrNull)
        );

        if (item === null) {
          break;
        }

        const match = pipe(
          Match.type<QueueItem>(),
          Match.when({ type: 'activate' }, ({ taskName, input }) =>
            self.activateTaskWithoutRunningQueue(taskName, input)
          ),
          Match.when({ type: 'complete' }, ({ taskName, input }) =>
            self.completeTaskWithoutRunningQueue(taskName, input)
          ),
          Match.exhaustive
        );

        yield* $(match(item));
      }
    });
  }

  getWorkflowState() {
    return this.workflow.getState();
  }
}

export function make<
  W extends Workflow,
  C extends W extends Workflow<infer WC> ? WC : object
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const stateManager = yield* $(StateManager);
    const queue = yield* $(Queue.unbounded<QueueItem>());

    return new Interpreter<
      WorkflowTasksActivitiesOutputs<W>
    >(workflow, stateManager, context, queue);
  });
}
