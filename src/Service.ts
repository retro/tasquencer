import { Effect, Match, Option, Queue, pipe } from 'effect';

import { State } from './State.js';
import { TaskActivitiesReturnType } from './builder/TaskBuilder.js';
import { BaseTask } from './elements/BaseTask.js';
import { CompositeTask } from './elements/CompositeTask.js';
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
export class Service<
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

  start<I>(input?: I) {
    return this.workflow.interpreter
      .start(this.workflowId, input)
      .pipe(Effect.provideService(State, this.state));
  }

  getInterpreterAndTaskNameFromPath(path: string[]) {
    const self = this;
    return Effect.gen(function* ($) {
      let current: Workflow | BaseTask = self.workflow;
      let workflowId = self.workflowId;
      const pathToTraverse = path.slice(0, path.length - 1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const taskName = path[path.length - 1]!;
      for (let i = 0; i < pathToTraverse.length; i++) {
        console.log(pathToTraverse[i]);
        if (i % 2 === 0 && current instanceof Workflow) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          current = yield* $(current.getTask(pathToTraverse[i]!));
        } else if (i % 2 === 1 && current instanceof CompositeTask) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          workflowId = WorkflowId(pathToTraverse[i]!);
          current = current.subWorkflow;
        } else {
          yield* $(Effect.fail(new Error('Invalid path')));
        }
      }
      if (!(current instanceof Workflow)) {
        yield* $(Effect.fail(new Error('Invalid path')));
      }
      return {
        interpreter: (current as Workflow).interpreter,
        taskName,
        workflowId,
      };
    });
  }

  fireTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: (T & string) | string[],
    input?: I
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const {
        interpreter,
        taskName: taskNameToFire,
        workflowId,
      } = yield* $(
        self.getInterpreterAndTaskNameFromPath(
          typeof taskName === 'string' ? [taskName] : taskName
        )
      );

      return yield* $(interpreter.fireTask(workflowId, taskNameToFire, input));
    }).pipe(Effect.provideService(State, this.state));
  }

  getWorkItems(taskName: string) {
    return this.workflow.interpreter
      .getWorkItems(this.workflowId, taskName)
      .pipe(Effect.provideService(State, this.state));
  }

  completeWorkItem(taskName: string, workItemId: WorkItemId) {
    return this.workflow.interpreter
      .completeWorkItem(this.workflowId, taskName, workItemId)
      .pipe(Effect.provideService(State, this.state));
  }

  cancelWorkflow() {
    return this.workflow.interpreter
      .cancel(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
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
  inspectState() {
    return this.state.inspect();
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

    const state = new StateImpl.StateImpl(idGenerator);

    const { id } = yield* $(
      workflow.initialize(),
      Effect.provideService(State, state)
    );

    const interpreter = new Service<
      WorkflowTasksActivitiesOutputs<W>,
      WorkflowOnStartReturnType<W>,
      R,
      E
    >(id, workflow, context, state, queue);

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
