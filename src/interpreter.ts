import { Effect, Match, Option, Queue, pipe } from 'effect';

import { State } from './State.js';
import { TaskActivitiesReturnType } from './builder/TaskBuilder.js';
import { Task } from './elements/Task.js';
import {
  Workflow,
  WorkflowTasksActivitiesOutputs,
} from './elements/Workflow.js';
import { InvalidTaskStateTransition } from './errors.js';
import * as StateImpl from './state/StateImpl.js';
import {
  IdGenerator,
  TaskActionsService,
  WorkItemId,
  WorkflowId,
} from './types.js';
import { nanoidIdGenerator } from './util.js';

type QueueItem =
  | { type: 'fire'; taskName: string; input: unknown }
  | { type: 'exit'; taskName: string; input: unknown };

// TODO: Think about refactoring this class so everything is in the Workflow class instead
export class Interpreter<
  TasksActivitiesOutputs extends Record<string, TaskActivitiesReturnType>,
  OnStartReturnType = unknown,
  R = never,
  E = never
> {
  constructor(
    private workflowId: WorkflowId,
    private workflow: Workflow,
    private context: object,
    private state: State,
    private queue: Queue.Queue<QueueItem>
  ) {}
  // TODO: Check if workflow was already started
  private _start(input: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const performStart = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            const startCondition = yield* $(self.workflow.getStartCondition());
            yield* $(
              Effect.succeed(startCondition),
              Effect.tap((s) => s.incrementMarking(self.workflowId)),
              Effect.tap((s) => s.enableTasks(self.workflowId, self.context)),
              Effect.provideService(
                TaskActionsService,
                self.getTaskActionsService()
              )
            );

            yield* $(self.runQueue());
            yield* $(self.maybeEnd());
          })
        )
      );

      const result = yield* $(
        self.workflow.onStart({
          context: self.context,
          input,
          getWorkflowId() {
            return Effect.succeed(self.workflowId);
          },
          startWorkflow() {
            return performStart;
          },
        }) as Effect.Effect<never, never, unknown>
      );

      yield* $(performStart);

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  start<I>(input?: I) {
    return this._start(input) as Effect.Effect<
      | Effect.Effect.Context<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_start']>
        >
      | R,
      | Effect.Effect.Error<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_start']>
        >
      | E,
      unknown extends I
        ? undefined
        : unknown extends OnStartReturnType
        ? I
        : OnStartReturnType
    >;
  }

  private maybeEnd() {
    const { workflowId, workflow, context } = this;
    return Effect.gen(function* ($) {
      if (yield* $(workflow.isEndReached(workflowId))) {
        const performEnd = yield* $(Effect.once(workflow.end(workflowId)));

        yield* $(
          workflow.onEnd({
            context,
            getWorkflowId() {
              return Effect.succeed(workflowId);
            },
            endWorkflow() {
              return performEnd;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performEnd);
      }
    }).pipe(Effect.provideService(State, this.state));
  }

  private fireTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getState(self.workflowId));
      const isEnabled = yield* $(task.isEnabled(self.workflowId));
      if (!isEnabled) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: self.workflowId,
              taskName,
              from: taskState,
              to: 'fired',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.fire(self.workflowId, self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    }).pipe(Effect.provideService(State, this.state));
  }

  _fireTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.fireTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());

      return output;
    }).pipe(Effect.provideService(State, this.state));
  }

  fireTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._fireTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onFire']
        ? I
        : TasksActivitiesOutputs[T]['onFire']
    >;
  }

  private exitTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getState(self.workflowId));
      const isFired = yield* $(task.isFired(self.workflowId));
      if (!isFired) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: self.workflowId,
              taskName,
              from: taskState,
              to: 'exited',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.exit(self.workflowId, self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    }).pipe(Effect.provideService(State, this.state));
  }

  _exitTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.exitTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());
      yield* $(self.maybeEnd());

      return output;
    }).pipe(Effect.provideService(State, this.state));
  }

  /* exitTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._exitTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onExit']
        ? I
        : TasksActivitiesOutputs[T]['onExit']
    >;
  }*/

  getWorkItems(taskName: string) {
    const { workflow, workflowId } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      if (task instanceof Task) {
        return yield* $(task.getWorkItems(workflowId));
      }
      return []; // TODO: Should fail
    }).pipe(Effect.provideService(State, this.state));
  }

  completeWorkItem(taskName: string, workItemId: WorkItemId) {
    const self = this;
    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      if (task instanceof Task) {
        const result = yield* $(
          task.completeWorkItem(self.workflowId, workItemId),
          Effect.provideService(
            TaskActionsService,
            self.getTaskActionsService()
          )
        );
        yield* $(self.runQueue());
        yield* $(self.maybeEnd());
        return result;
      } else {
        return; // TODO: Should fail
      }
    }).pipe(Effect.provideService(State, this.state));
  }

  private getTaskActionsService() {
    const { queue } = this;
    return {
      fireTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'fire', taskName, input }),
          Effect.asUnit
        );
      },
      exitTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'exit', taskName, input }),
          Effect.asUnit
        );
      },
    };
  }

  private _cancelWorkflow() {
    return this.workflow
      .cancel(this.workflowId, this.context)
      .pipe(Effect.provideService(State, this.state));
  }

  cancelWorkflow() {
    return this._cancelWorkflow() as Effect.Effect<
      | Effect.Effect.Context<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_cancelWorkflow']>
        >
      | R,
      | Effect.Effect.Error<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_cancelWorkflow']>
        >
      | E,
      Effect.Effect.Success<
        ReturnType<Interpreter<TasksActivitiesOutputs>['_cancelWorkflow']>
      >
    >;
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
          Match.when({ type: 'fire' }, ({ taskName, input }) =>
            self.fireTaskWithoutRunningQueue(taskName, input)
          ),
          Match.when({ type: 'exit' }, ({ taskName, input }) =>
            self.exitTaskWithoutRunningQueue(taskName, input)
          ),
          Match.exhaustive
        );

        yield* $(match(item));
      }
    });
  }

  getWorkflowState() {
    return this.workflow
      .getState(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
  }
  getWorkflowTasks() {
    return this.workflow
      .getTasks(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
  }
  getWorkflowConditions() {
    return this.workflow
      .getConditions(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
  }

  getFullState() {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(self.getWorkflowState());
      const workflowTasks = yield* $(self.getWorkflowTasks());
      const workflowConditions = yield* $(self.getWorkflowConditions());

      return {
        workflow: workflowState,
        tasks: workflowTasks,
        conditions: workflowConditions,
      };
    });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type WorkflowR<T> = T extends Workflow<infer R, any, any> ? R : never;
type WorkflowE<T> = T extends Workflow<any, infer E, any> ? E : never;
type WorkflowContext<T> = T extends Workflow<any, any, infer C> ? C : never;
type WorkflowOnStartReturnType<T> = T extends Workflow<
  any,
  any,
  any,
  any,
  infer R
>
  ? R
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function initialize<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  C extends WorkflowContext<W> = WorkflowContext<W>
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const queue = yield* $(Queue.unbounded<QueueItem>());
    const maybeIdGenerator = yield* $(Effect.serviceOption(IdGenerator));
    const idGenerator = Option.getOrElse(
      maybeIdGenerator,
      () => nanoidIdGenerator
    );
    const state = yield* $(StateImpl.make(idGenerator));

    const { id } = yield* $(
      workflow.initialize(),
      Effect.provideService(State, state)
    );

    const interpreter = new Interpreter<
      WorkflowTasksActivitiesOutputs<W>,
      WorkflowOnStartReturnType<W>,
      R,
      E
    >(id, workflow, context, state, queue);

    yield* $(interpreter.start());

    return interpreter;
  });
}

/*export function resume<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  C extends WorkflowContext<W> = WorkflowContext<W>
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const queue = yield* $(Queue.unbounded<QueueItem>());

    return new Interpreter<
      WorkflowTasksActivitiesOutputs<W>,
      WorkflowOnStartReturnType<W>,
      R,
      E
    >(workflow, context, queue);
  });
}*/
