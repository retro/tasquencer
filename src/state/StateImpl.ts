/* eslint @typescript-eslint/no-non-null-assertion: 0 */
import { Effect } from 'effect';
import { create } from 'mutative';

import { State } from '../State.js';
import {
  ConditionDoesNotExistInStore,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExistInStore,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ConditionInstance,
  ConditionName,
  IdGenerator,
  Store,
  TaskInstance,
  TaskInstanceState,
  TaskName,
  WorkItem,
  WorkItemId,
  WorkItemState,
  WorkflowId,
  WorkflowInstance,
  WorkflowInstanceParent,
  WorkflowInstanceState,
  isValidTaskInstanceTransition,
  validWorkItemStateTransitions,
  validWorkflowInstanceTransitions,
} from '../types.js';

export class StateImpl implements State {
  private store: Store = {};
  private idGenerator: IdGenerator;

  constructor(idGenerator: IdGenerator) {
    this.idGenerator = idGenerator;
  }

  initializeWorkflow(
    payload: {
      name: string;
      tasks: TaskName[];
      conditions: ConditionName[];
    },
    context: unknown,
    parent: WorkflowInstanceParent = null
  ) {
    const self = this;
    const { idGenerator } = this;
    return Effect.gen(function* ($) {
      const workflowId = yield* $(idGenerator.workflow());
      const workflowTasks = payload.tasks.reduce<
        Record<TaskName, TaskInstance>
      >((acc, task) => {
        acc[task] = {
          name: task,
          workflowName: payload.name,
          workflowId,
          generation: 0,
          state: 'disabled',
        };
        return acc;
      }, {});

      const workflowConditions = payload.conditions.reduce<
        Record<ConditionName, ConditionInstance>
      >((acc, condition) => {
        acc[condition] = {
          name: condition,
          workflowId,
          workflowName: payload.name,
          marking: 0,
        };
        return acc;
      }, {});

      const workflow: WorkflowInstance = {
        parent,
        id: workflowId,
        name: payload.name,
        state: 'initialized',
        context,
      };

      const workflowState = {
        workflow,
        tasks: workflowTasks,
        conditions: workflowConditions,
        workItems: {},
        tasksToWorkItems: {},
        tasksToWorkflows: {},
      };

      if (!parent) {
        self.store = create(self.store, (draft) => {
          draft[workflowId] = workflowState;
        });
      } else {
        const taskGeneration =
          self.store[parent.workflowId]!.tasks[parent.taskName]!.generation;

        self.store = create(self.store, (draft) => {
          draft[workflowId] = workflowState;
          draft[parent.workflowId]!.tasksToWorkflows[parent.taskName] ||= {};
          draft[parent.workflowId]!.tasksToWorkflows[parent.taskName]![
            taskGeneration
          ] ||= [];

          draft[parent.workflowId]!.tasksToWorkflows[parent.taskName]![
            taskGeneration
          ]!.push(workflowId);
        });
      }

      return workflow;
    });
  }

  getWorkflow(workflowId: WorkflowId) {
    const { store } = this;
    return Effect.gen(function* ($) {
      const workflow = store[workflowId]?.workflow;

      if (!workflow) {
        return yield* $(Effect.fail(new WorkflowDoesNotExist({ workflowId })));
      }
      return workflow;
    });
  }

  getWorkflowContext(workflowId: WorkflowId) {
    return this.getWorkflow(workflowId).pipe(
      Effect.map((workflow) => workflow.context)
    );
  }

  getTasks(workflowId: WorkflowId) {
    return Effect.succeed(Object.values(this.store[workflowId]?.tasks ?? {}));
  }

  getConditions(id: WorkflowId) {
    return Effect.succeed(Object.values(this.store[id]?.conditions ?? {}));
  }

  getTask(workflowId: WorkflowId, taskName: TaskName) {
    const { store } = this;
    return Effect.gen(function* ($) {
      const task = store[workflowId]?.tasks[taskName];

      if (!task) {
        return yield* $(
          Effect.fail(new TaskDoesNotExistInStore({ taskName, workflowId }))
        );
      }

      return task;
    });
  }

  getTaskState(workflowId: WorkflowId, taskName: TaskName) {
    return this.getTask(workflowId, taskName).pipe(
      Effect.map((task) => task.state)
    );
  }

  getCondition(workflowId: WorkflowId, conditionName: ConditionName) {
    const { store } = this;
    return Effect.gen(function* ($) {
      const condition = store[workflowId]?.conditions[conditionName];

      if (!condition || condition.workflowId !== workflowId) {
        return yield* $(
          Effect.fail(
            new ConditionDoesNotExistInStore({ conditionName, workflowId })
          )
        );
      }

      return condition;
    });
  }

  getConditionMarking(workflowId: WorkflowId, conditionName: ConditionName) {
    return this.getCondition(workflowId, conditionName).pipe(
      Effect.map((condition) => condition.marking)
    );
  }

  updateWorkflowState(
    workflowId: WorkflowId,
    workflowState: Exclude<WorkflowInstanceState, 'initialized'>
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workflow = yield* $(self.getWorkflow(workflowId));

      if (
        !validWorkflowInstanceTransitions[workflow.state].has(workflowState)
      ) {
        return yield* $(
          Effect.fail(
            new InvalidWorkflowStateTransition({
              workflowId,
              from: workflow.state,
              to: workflowState,
            })
          )
        );
      }

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.workflow.state = workflowState;
      });
    });
  }

  updateWorkflowContext(workflowId: WorkflowId, context: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.getWorkflow(workflowId));

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.workflow.context = context;
      });
    });
  }

  updateTaskState(
    workflowId: WorkflowId,
    taskName: TaskName,
    nextTaskState: TaskInstanceState
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.getTask(workflowId, taskName));

      if (!isValidTaskInstanceTransition(task.state, nextTaskState)) {
        return yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId,
              taskName,
              from: task.state,
              to: nextTaskState,
            })
          )
        );
      }

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.tasks[taskName]!.state = nextTaskState;
        if (nextTaskState === 'fired') {
          draft[workflowId]!.tasks[taskName]!.generation += 1;
        }
      });
    });
  }

  enableTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'enabled');
  }

  disableTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'disabled');
  }

  fireTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'fired');
  }

  exitTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'exited');
  }

  cancelTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'canceled');
  }

  failTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'failed');
  }

  updateCondition(
    workflowId: WorkflowId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const condition = yield* $(self.getCondition(workflowId, conditionName));

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.conditions[conditionName] = f(condition);
      });
    });
  }

  incrementConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: condition.marking + 1 };
    });
  }

  decrementConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: Math.max(condition.marking - 1, 0) };
    });
  }

  emptyConditionMarking(workflowId: WorkflowId, conditionName: ConditionName) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: 0 };
    });
  }

  initializeWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    payload: unknown = null
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItemId = yield* $(self.idGenerator.workItem());

      const task = yield* $(self.getTask(workflowId, taskName));
      const workItem: WorkItem = {
        taskName,
        id: workItemId,
        workflowName: task.workflowName,
        state: 'initialized',
        payload,
      };

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.workItems[workItemId] = workItem;
        draft[workflowId]!.tasksToWorkItems[taskName] ||= {};
        draft[workflowId]!.tasksToWorkItems[taskName]![task.generation] ||= [];
        draft[workflowId]!.tasksToWorkItems[taskName]![task.generation]!.push(
          workItemId
        );
      });

      return workItem;
    });
  }

  getWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItem = self.store[workflowId]?.workItems[workItemId];

      if (!workItem || workItem.taskName !== taskName) {
        return yield* $(
          Effect.fail(new WorkItemDoesNotExist({ workflowId, workItemId }))
        );
      }

      return workItem;
    });
  }

  updateWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId,
    payload: unknown
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItem = self.store[workflowId]?.workItems[workItemId];

      if (!workItem || workItem.taskName !== taskName) {
        return yield* $(
          Effect.fail(new WorkItemDoesNotExist({ workflowId, workItemId }))
        );
      }

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.workItems[workItemId]!.payload = payload;
      });
    });
  }

  updateWorkItemState(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId,
    nextState: WorkItemState
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItem = yield* $(
        self.getWorkItem(workflowId, taskName, workItemId)
      );

      if (!validWorkItemStateTransitions[workItem.state].has(nextState)) {
        return yield* $(
          Effect.fail(
            new InvalidWorkItemTransition({
              workflowId,
              workItemId,
              from: workItem.state,
              to: nextState,
            })
          )
        );
      }

      self.store = create(self.store, (draft) => {
        draft[workflowId]!.workItems[workItemId]!.state = nextState;
      });
    });
  }

  getWorkItems(workflowId: WorkflowId, taskName: TaskName) {
    const self = this;
    return Effect.gen(function* ($) {
      const task = yield* $(self.getTask(workflowId, taskName));

      const workItemIds =
        self.store[workflowId]?.tasksToWorkItems[taskName]?.[task.generation] ??
        [];
      return workItemIds.reduce<WorkItem[]>((acc, workItemId) => {
        const workItem = self.store[workflowId]?.workItems[workItemId];
        if (workItem) {
          acc.push(workItem);
        }
        return acc;
      }, []);
    });
  }

  getWorkflows(workflowId: WorkflowId, taskName: TaskName) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.getTask(workflowId, taskName));

      const workflowIds =
        self.store[workflowId]?.tasksToWorkflows[taskName]?.[task.generation] ??
        [];
      return workflowIds.reduce<WorkflowInstance[]>((acc, workflowId) => {
        const workflow = self.store[workflowId]?.workflow;
        if (workflow) {
          acc.push(workflow);
        }
        return acc;
      }, []);
    });
  }

  inspect() {
    return Effect.succeed(this.store);
  }
}

export function make(idGenerator: IdGenerator) {
  return new StateImpl(idGenerator);
}
