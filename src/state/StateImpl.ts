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
  StateChangeLogger,
  Store,
  StorePersistableState,
  TaskInstance,
  TaskInstanceState,
  TaskName,
  WorkItemId,
  WorkItemInstance,
  WorkItemInstanceState,
  WorkflowId,
  WorkflowInstance,
  WorkflowInstanceParent,
  WorkflowInstanceState,
  isValidTaskInstanceTransition,
  validWorkItemInstanceStateTransitions,
  validWorkflowInstanceTransitions,
} from '../types.js';

function storeToPersistableState(store: Store): StorePersistableState {
  const workflows: WorkflowInstance[] = [];
  const tasks: TaskInstance[] = [];
  const conditions: ConditionInstance[] = [];
  const workItems: WorkItemInstance[] = [];

  for (const workflowIdStr in store) {
    const workflowId = WorkflowId(workflowIdStr);
    const workflow = store[workflowId]!.workflow;
    workflows.push(workflow);

    for (const taskNameStr in store[workflowId]!.tasks) {
      const taskName = TaskName(taskNameStr);
      const task = store[workflowId]!.tasks[taskName]!;
      tasks.push(task);
    }

    for (const conditionNameStr in store[workflowId]!.conditions) {
      const conditionName = ConditionName(conditionNameStr);
      const condition = store[workflowId]!.conditions[conditionName]!;
      conditions.push(condition);
    }

    for (const workItemIdStr in store[workflowId]!.workItems) {
      const workItemId = WorkItemId(workItemIdStr);
      const workItem = store[workflowId]!.workItems[workItemId]!;
      workItems.push(workItem);
    }
  }

  return {
    workflows,
    tasks,
    conditions,
    workItems,
  };
}

function persistableStateToStore(state: StorePersistableState): Store {
  const store: Store = {};
  for (const workflow of state.workflows) {
    store[workflow.id] = {
      workflow,
      tasks: {},
      conditions: {},
      workItems: {},
      tasksToWorkItems: {},
      tasksToWorkflows: {},
    };
  }

  for (const task of state.tasks) {
    store[task.workflowId]!.tasks[task.name] = task;
  }

  for (const condition of state.conditions) {
    store[condition.workflowId]!.conditions[condition.name] = condition;
  }

  for (const workItem of state.workItems) {
    const taskName = TaskName(workItem.taskName);
    store[workItem.workflowId]!.workItems[workItem.id] = workItem;
    store[workItem.workflowId]!.tasksToWorkItems[taskName] ||= {};
    store[workItem.workflowId]!.tasksToWorkItems[taskName]![
      workItem.taskGeneration
    ] ||= [];
    store[workItem.workflowId]!.tasksToWorkItems[taskName]![
      workItem.taskGeneration
    ]!.push(workItem.id);
  }

  for (const workflow of state.workflows) {
    if (workflow.parent) {
      const taskGeneration = workflow.parent.taskGeneration;
      store[workflow.parent.workflowId]!.tasksToWorkflows[
        workflow.parent.taskName
      ] ||= {};
      store[workflow.parent.workflowId]!.tasksToWorkflows[
        workflow.parent.taskName
      ]![taskGeneration] ||= [];
      store[workflow.parent.workflowId]!.tasksToWorkflows[
        workflow.parent.taskName
      ]![taskGeneration]!.push(workflow.id);
    }
  }

  return store;
}

function makeGetState(store: Store) {
  return () => storeToPersistableState(store);
}

export class StateImpl implements State {
  private store: Store;
  private idGenerator: IdGenerator;
  private changeLogger: StateChangeLogger;

  constructor(
    idGenerator: IdGenerator,
    changeLogger: StateChangeLogger,
    state?: StorePersistableState
  ) {
    this.idGenerator = idGenerator;
    this.changeLogger = changeLogger;
    if (state) {
      this.store = persistableStateToStore(state);
    } else {
      this.store = {};
    }
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

      self.changeLogger.log({
        change: { type: 'WORKFLOW_INITIALIZED', workflow },
        getState: makeGetState(self.store),
      });

      Object.values(workflowTasks).forEach((task) => {
        self.changeLogger.log({
          change: { type: 'TASK_INITIALIZED', task },
          getState: makeGetState(self.store),
        });
      });

      Object.values(workflowConditions).forEach((condition) => {
        self.changeLogger.log({
          change: { type: 'CONDITION_INITIALIZED', condition },
          getState: makeGetState(self.store),
        });
      });

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

      self.changeLogger.log({
        change: {
          type: 'WORKFLOW_STATE_UPDATED',
          workflow: self.store[workflowId]!.workflow,
        },
        getState: makeGetState(self.store),
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

      self.changeLogger.log({
        change: {
          type: 'WORKFLOW_CONTEXT_UPDATED',
          workflow: self.store[workflowId]!.workflow,
        },
        getState: makeGetState(self.store),
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
        if (nextTaskState === 'started') {
          draft[workflowId]!.tasks[taskName]!.generation += 1;
        }
      });

      self.changeLogger.log({
        change: {
          type: 'TASK_STATE_UPDATED',
          task: self.store[workflowId]!.tasks[taskName]!,
        },
        getState: makeGetState(self.store),
      });
    });
  }

  enableTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'enabled');
  }

  disableTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'disabled');
  }

  startTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'started');
  }

  completeTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'completed');
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

      self.changeLogger.log({
        change: {
          type: 'CONDITION_MARKING_UPDATED',
          condition: self.store[workflowId]!.conditions[conditionName]!,
        },
        getState: makeGetState(self.store),
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
      return { ...condition, marking: condition.marking - 1 };
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
      const workItem: WorkItemInstance = {
        id: workItemId,
        taskName,
        taskGeneration: task.generation,
        workflowId: task.workflowId,
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

      self.changeLogger.log({
        change: { type: 'WORK_ITEM_INITIALIZED', workItem },
        getState: makeGetState(self.store),
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

  updateWorkItemPayload(
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

      self.changeLogger.log({
        change: {
          type: 'WORK_ITEM_PAYLOAD_UPDATED',
          workItem: self.store[workflowId]!.workItems[workItemId]!,
        },
        getState: makeGetState(self.store),
      });
    });
  }

  updateWorkItemState(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId,
    nextState: WorkItemInstanceState
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItem = yield* $(
        self.getWorkItem(workflowId, taskName, workItemId)
      );

      if (
        !validWorkItemInstanceStateTransitions[workItem.state].has(nextState)
      ) {
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

      self.changeLogger.log({
        change: {
          type: 'WORK_ITEM_STATE_UPDATED',
          workItem: self.store[workflowId]!.workItems[workItemId]!,
        },
        getState: makeGetState(self.store),
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
      return workItemIds.reduce<WorkItemInstance[]>((acc, workItemId) => {
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

  getState() {
    return Effect.succeed(storeToPersistableState(this.store));
  }

  inspect() {
    return Effect.succeed(this.store);
  }
}
