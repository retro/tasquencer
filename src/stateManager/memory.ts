import { Effect, Ref } from 'effect';
import { type Draft, create } from 'mutative';

import type { Condition } from '../elements/Condition.js';
import type { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import { WorkflowNotInitialized } from '../errors.js';
import { TaskState } from '../types.js';
import {
  type ConditionItem,
  IdGenerator,
  type StateManager,
  type TaskItem,
  type WorkflowItem,
  WorkflowState,
} from './types.js';

type WorkflowStateRef = Ref.Ref<WorkflowState>;

function getInitialWorkflowState(id: string, name: string): WorkflowItem {
  return {
    id,
    name,
    state: 'running',
    tasks: {},
    conditions: {},
  };
}

function getInitialConditionItem(condition: Condition): ConditionItem {
  return {
    id: condition.id,
    name: condition.name,
    marking: 0,
  };
}

function getInitialTaskItem(task: Task): TaskItem {
  return {
    id: task.id,
    name: task.name,
    state: 'disabled',
  };
}

function updateStoreRef(
  storeRef: WorkflowStateRef,
  updateFn: (draft: Draft<WorkflowState>) => unknown
) {
  return Ref.update(storeRef, (state) => {
    return create(state, (draft) => {
      updateFn(draft);
    });
  });
}

function getWorkflowStateById(storeRef: WorkflowStateRef, id: string) {
  return Effect.gen(function* ($) {
    const store = yield* $(Ref.get(storeRef));
    const workflowState = store[id];
    if (workflowState) {
      return workflowState;
    }
    return yield* $(Effect.fail(WorkflowNotInitialized()));
  });
}

function getWorkflowState(storeRef: WorkflowStateRef, workflow: Workflow) {
  return getWorkflowStateById(storeRef, workflow.id);
}

function getTaskState(storeRef: WorkflowStateRef, task: Task) {
  return Effect.gen(function* ($) {
    const workflowState = yield* $(getWorkflowState(storeRef, task.workflow));
    return workflowState.tasks[task.id];
  });
}

function getConditionState(storeRef: WorkflowStateRef, condition: Condition) {
  return Effect.gen(function* ($) {
    const workflowState = yield* $(
      getWorkflowState(storeRef, condition.workflow)
    );
    return workflowState.conditions[condition.id];
  });
}

export class Memory implements StateManager {
  constructor(
    private readonly storeRef: WorkflowStateRef,
    private readonly idGenerator: IdGenerator
  ) {}

  initializeWorkflow(workflow: Workflow) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      yield* $(
        updateStoreRef(storeRef, (draft) => {
          draft[workflow.id] = getInitialWorkflowState(
            workflow.id,
            workflow.name
          );
        })
      );
    });
  }

  updateWorkflowState(workflow: Workflow, state: 'canceled' | 'done') {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(getWorkflowState(storeRef, workflow));

      yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          draft[workflow.id]!.state = state;
        })
      );
    });
  }

  incrementConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(getWorkflowState(storeRef, condition.workflow));

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[condition.workflow.id]!;
          const conditionItem =
            workflow.conditions[condition.id] ??
            getInitialConditionItem(condition);
          conditionItem.marking = conditionItem.marking + 1;
          workflow.conditions[condition.id] = conditionItem;
        })
      );
    });
  }
  decrementConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(getWorkflowState(storeRef, condition.workflow));

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[condition.workflow.id]!;
          const conditionItem =
            workflow.conditions[condition.id] ??
            getInitialConditionItem(condition);
          // TODO: if we move marking count to be cached on the condition level
          // condition shouldn't try to decrement below 0. This can happen when
          // there is an or join flow which wasn't enabled, but the task was enabled
          // which then consumes the tokens from all incoming conditions.
          conditionItem.marking = Math.max(conditionItem.marking - 1, 0);
          workflow.conditions[condition.id] = conditionItem;
        })
      );
    });
  }
  emptyConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(getWorkflowState(storeRef, condition.workflow));

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[condition.workflow.id]!;
          const conditionItem =
            workflow.conditions[condition.id] ??
            getInitialConditionItem(condition);
          conditionItem.marking = 0;
          workflow.conditions[condition.id] = conditionItem;
        })
      );
    });
  }
  getConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const conditionState = yield* $(getConditionState(storeRef, condition));

      return conditionState?.marking ?? 0;
    });
  }

  updateTaskState(task: Task, taskState: TaskState) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(getWorkflowState(storeRef, task.workflow));

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[task.workflow.id]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const taskItem = workflow.tasks[task.id] ?? getInitialTaskItem(task);
          taskItem.state = taskState;
          workflow.tasks[task.id] = taskItem;
        })
      );
    });
  }

  enableTask(task: Task) {
    return this.updateTaskState(task, 'enabled');
  }
  disableTask(task: Task) {
    return this.updateTaskState(task, 'disabled');
  }
  activateTask(task: Task) {
    return this.updateTaskState(task, 'active');
  }
  completeTask(task: Task) {
    return this.updateTaskState(task, 'completed');
  }
  cancelTask(task: Task) {
    return this.updateTaskState(task, 'canceled');
  }
  getTaskState(task: Task) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const taskState = yield* $(getTaskState(storeRef, task));

      return taskState?.state ?? 'disabled';
    });
  }

  getWorkflowState(workflowOrId: Workflow | string) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(
        typeof workflowOrId === 'string'
          ? getWorkflowStateById(storeRef, workflowOrId)
          : getWorkflowState(storeRef, workflowOrId)
      );
      return {
        id: workflowState.id,
        name: workflowState.name,
        state: workflowState.state,
        tasks: workflowState.tasks,
        conditions: workflowState.conditions,
      };
    });
  }
}

export function createMemory() {
  return Effect.gen(function* ($) {
    const idGenerator = yield* $(IdGenerator);
    const storeRef = yield* $(Ref.make({}));

    return new Memory(storeRef, idGenerator);
  });
}
