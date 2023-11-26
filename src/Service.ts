import { Effect, Option, Queue } from 'effect';

import { State } from './State.js';
import { TaskActivitiesReturnType } from './builder/TaskBuilder.js';
import { BaseTask } from './elements/BaseTask.js';
import { CompositeTask } from './elements/CompositeTask.js';
import { Task } from './elements/Task.js';
import {
  Workflow,
  WorkflowTasksActivitiesOutputs,
} from './elements/Workflow.js';
import { InvalidPath } from './errors.js';
import * as StateImpl from './state/StateImpl.js';
import { IdGenerator, TaskName, WorkItemId, WorkflowId } from './types.js';
import { nanoidIdGenerator } from './util.js';

function pathAsArray(path: string | string[]) {
  return typeof path === 'string' ? [path] : path;
}

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

  startRootWorkflow(input?: unknown) {
    return this.startWorkflow([], input);
  }

  cancelRootWorkflow() {
    return this.cancelWorkflow([]);
  }

  startWorkflow<I>(path: string[] | string, input?: I) {
    const self = this;

    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workflowPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.workflow.workflow.interpreter.startWorkflow(
          executionPlan.workflow.id,
          input
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  initializeWorkflow<I>(pathOrName: string[] | string, input?: I) {
    const path = pathAsArray(pathOrName);
    const self = this;

    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.taskPathToExecutionPlan(path));
      if (executionPlan.task instanceof CompositeTask) {
        const result = yield* $(
          executionPlan.task.subWorkflow.interpreter.initializeWorkflow(input, {
            workflowId: executionPlan.workflow.id,
            taskName: executionPlan.taskName,
          })
        );
        return result;
      }
      return yield* $(Effect.fail(new InvalidPath({ path, pathType: 'task' })));
    }).pipe(Effect.provideService(State, this.state));
  }

  cancelWorkflow(path: string[] | string) {
    const self = this;

    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workflowPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.workflow.workflow.interpreter.cancelWorkflow(
          executionPlan.workflow.id
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  fireTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: (T & string) | string[],
    input?: I
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.taskPathToExecutionPlan(pathAsArray(taskName))
      );

      const result = yield* $(
        executionPlan.workflow.workflow.interpreter.fireTask(
          executionPlan.workflow.id,
          executionPlan.taskName,
          input
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  initializeWorkItem(path: string | string[], input: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.taskPathToExecutionPlan(pathAsArray(path))
      );

      if (!(executionPlan.task instanceof Task)) {
        return yield* $(
          Effect.fail(
            new InvalidPath({ path: pathAsArray(path), pathType: 'task' })
          )
        );
      }

      const result = yield* $(
        executionPlan.task.initializeWorkItem(executionPlan.workflow.id, input)
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  completeWorkItem(path: [string], payload: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workItemPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.task.completeWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          payload
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    });
  }

  cancelWorkItem(path: [string], payload: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workItemPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.task.cancelWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          payload
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    });
  }

  startWorkItem(path: [string], payload: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workItemPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.task.startWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          payload
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    });
  }

  failWorkItem(path: [string], payload: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workItemPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.task.failWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          payload
        )
      );

      for (const queue of executionPlan.queuesToRun) {
        yield* $(queue.workflow.interpreter.runQueueAndMaybeEnd(queue.id));
      }

      return result;
    });
  }

  getWorkItems(taskName: string) {
    return this.workflow.interpreter
      .getWorkItems(this.workflowId, taskName)
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

  private taskPathToExecutionPlan(path: string[]) {
    if (path.length % 2 === 0) {
      // Path should contain an odd number of items: [taskName, workflowId, taskName...]
      return Effect.fail(new InvalidPath({ path, pathType: 'task' }));
    }

    const initialState: {
      index: number;
      current: Workflow | BaseTask;
      restPath: string[];
      taskNames: TaskName[];
      workflows: {
        workflow: Workflow;
        id: WorkflowId;
      }[];
    } = {
      index: 0,
      current: this.workflow,
      restPath: [...path],
      taskNames: [],
      workflows: [{ workflow: this.workflow, id: this.workflowId }],
    };
    return Effect.gen(function* ($) {
      const result = yield* $(
        Effect.iterate(initialState, {
          while: (state) => state.restPath.length > 0,
          body: (state) =>
            Effect.gen(function* ($) {
              if (state.index % 2 === 0 && state.current instanceof Workflow) {
                // Every even index should contain the TaskName
                const [taskName, ...restPath] = state.restPath;

                if (!taskName) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'task' }))
                  );
                }

                const current = yield* $(state.current.getTask(taskName));

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  taskNames: [...state.taskNames, TaskName(taskName)],
                };
              } else if (
                state.index % 2 === 1 &&
                state.current instanceof CompositeTask
              ) {
                // Every odd index should contain the WorkflowId
                const [workflowId, ...restPath] = state.restPath;

                if (!workflowId) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'task' }))
                  );
                }

                const current = state.current.subWorkflow;

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  workflows: [
                    ...state.workflows,
                    {
                      workflow: state.current.subWorkflow,
                      id: WorkflowId(workflowId),
                    },
                  ],
                };
              }

              return yield* $(
                Effect.fail(new InvalidPath({ path, pathType: 'task' }))
              );
            }),
        })
      );

      // Last path item should be a taskName
      if (!(result.current instanceof BaseTask)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'task' }))
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];
      const taskName = result.taskNames[result.taskNames.length - 1];

      if (!workflow || !taskName) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'task' }))
        );
      }

      return {
        queuesToRun: result.workflows.reverse(),
        workflow,
        taskName,
        task: result.current,
      };
    });
  }

  private workflowPathToExecutionPlan(path: string[]) {
    if (path.length % 2 === 1) {
      // Path should contain an even number of items: [taskName, workflowId...]
      return Effect.fail(new InvalidPath({ path, pathType: 'workflow' }));
    }

    const initialState: {
      index: number;
      current: Workflow | BaseTask;
      restPath: string[];
      workflows: {
        workflow: Workflow;
        id: WorkflowId;
      }[];
    } = {
      index: 0,
      current: this.workflow,
      restPath: [...path],
      workflows: [{ workflow: this.workflow, id: this.workflowId }],
    };

    return Effect.gen(function* ($) {
      const result = yield* $(
        Effect.iterate(initialState, {
          while: (state) => state.restPath.length > 0,
          body: (state) =>
            Effect.gen(function* ($) {
              if (state.index % 2 === 0 && state.current instanceof Workflow) {
                // Every even index should contain the TaskName
                const [taskName, ...restPath] = state.restPath;

                if (!taskName) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
                  );
                }

                const current = yield* $(state.current.getTask(taskName));

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                };
              } else if (
                state.index % 2 === 1 &&
                state.current instanceof CompositeTask
              ) {
                // Every odd index should contain the WorkflowId
                const [workflowId, ...restPath] = state.restPath;

                if (!workflowId) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
                  );
                }

                const current = state.current.subWorkflow;

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  workflows: [
                    ...state.workflows,
                    {
                      workflow: state.current.subWorkflow,
                      id: WorkflowId(workflowId),
                    },
                  ],
                };
              }

              return yield* $(
                Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
              );
            }),
        })
      );

      // Last path item should be a WorkflowId
      if (!(result.current instanceof Workflow)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];

      if (!workflow) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
        );
      }

      return {
        queuesToRun: result.workflows.reverse(),
        workflow,
      };
    });
  }

  private workItemPathToExecutionPlan(path: string[]) {
    if (path.length % 2 === 1) {
      // Path should contain an even number of items, and last item should be the workItemId: [taskName, workflowId... taskName, workItemId]
      return Effect.fail(new InvalidPath({ path, pathType: 'workItem' }));
    }

    const initialState: {
      index: number;
      current: Workflow | BaseTask;
      restPath: string[];
      workItemId: WorkItemId | null;
      taskNames: TaskName[];
      workflows: {
        workflow: Workflow;
        id: WorkflowId;
      }[];
    } = {
      index: 0,
      current: this.workflow,
      restPath: [...path],
      workItemId: null,
      taskNames: [],
      workflows: [{ workflow: this.workflow, id: this.workflowId }],
    };

    return Effect.gen(function* ($) {
      const result = yield* $(
        Effect.iterate(initialState, {
          while: (state) => state.restPath.length > 0,
          body: (state) =>
            Effect.gen(function* ($) {
              if (state.index % 2 === 0 && state.current instanceof Workflow) {
                // Every even index should contain the TaskName
                const [taskName, ...restPath] = state.restPath;

                if (!taskName) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
                  );
                }

                const current = yield* $(state.current.getTask(taskName));

                if (restPath.length === 1 && restPath[0]) {
                  return {
                    ...state,
                    current,
                    index: state.index + 2,
                    restPath: [],
                    workItemId: WorkItemId(restPath[0]),
                  };
                }

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                };
              } else if (
                state.index % 2 === 1 &&
                state.current instanceof CompositeTask
              ) {
                // Every odd index should contain the WorkflowId
                const [workflowId, ...restPath] = state.restPath;

                if (!workflowId) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
                  );
                }

                const current = state.current.subWorkflow;

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  workflows: [
                    ...state.workflows,
                    {
                      workflow: state.current.subWorkflow,
                      id: WorkflowId(workflowId),
                    },
                  ],
                };
              }

              return yield* $(
                Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
              );
            }),
        })
      );

      // Last processed item should be a BaseTask, because when in case where we encounter a BaseTask, and there is only one item left in the path, we assume that the last item is the workItemId
      if (!(result.current instanceof Task)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];
      const taskName = result.taskNames[result.taskNames.length - 1];
      const workItemId = result.workItemId;

      if (!workflow || !taskName || !workItemId) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
        );
      }

      return {
        queuesToRun: result.workflows.reverse(),
        workflow,
        task: result.current,
        workItemId,
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

    const state = new StateImpl.StateImpl(idGenerator);

    const { id } = yield* $(
      workflow.initialize(context),
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
