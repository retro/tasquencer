import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';
import { type Draft, create } from 'mutative';

import type { Condition } from '../Condition.js';
import type { Task } from '../Task.js';
import { WorkflowNotInitialized } from '../Workflow.js';
import { WTaskState } from '../types.js';
import {
  type ConditionItem,
  IdGenerator,
  type StateManager,
  type TaskItem,
  type WorkflowItem,
} from './types.js';

type ExtendedWorkflowItem = WorkflowItem & {
  taskNameToId: Record<string, string>;
  conditionNameToId: Record<string, string>;
};

type ExtendedWorkflowState = Record<string, ExtendedWorkflowItem>;

type WorkflowStateRef = Ref.Ref<ExtendedWorkflowState>;

function getInitialWorkflowState(): ExtendedWorkflowItem {
  return {
    tasks: {},
    conditions: {},
    taskNameToId: {},
    conditionNameToId: {},
  };
}

function getInitialConditionItem(
  condition: Condition,
  id: string
): ConditionItem {
  return {
    id,
    name: condition.name,
    marking: 0,
  };
}

function getInitialTaskItem(task: Task, id: string): TaskItem {
  return {
    id,
    name: task.name,
    state: 'disabled',
  };
}

function updateStoreRef(
  storeRef: WorkflowStateRef,
  updateFn: (draft: Draft<ExtendedWorkflowState>) => unknown
) {
  return Ref.update(storeRef, (state) =>
    create(state, (draft) => {
      updateFn(draft);
    })
  );
}

function getWorkflowById(storeRef: WorkflowStateRef, workflowId: string) {
  return Effect.gen(function* ($) {
    const store = yield* $(Ref.get(storeRef));
    const workflow = store[workflowId];
    if (workflow) {
      return workflow;
    }
    return yield* $(Effect.fail(WorkflowNotInitialized()));
  });
}

function getTaskId(storeRef: WorkflowStateRef, task: Task) {
  return Effect.gen(function* ($) {
    const workflowId = yield* $(task.workflow.getId());
    const workflowState = yield* $(getWorkflowById(storeRef, workflowId));
    return workflowState.taskNameToId[task.name];
  });
}

function getConditionId(storeRef: WorkflowStateRef, condition: Condition) {
  return Effect.gen(function* ($) {
    const workflowId = yield* $(condition.workflow.getId());
    const workflowState = yield* $(getWorkflowById(storeRef, workflowId));
    return workflowState.conditionNameToId[condition.name];
  });
}

function ensureTask(
  storeRef: WorkflowStateRef,
  idGenerator: IdGenerator,
  task: Task
) {
  return Effect.gen(function* ($) {
    const workflowId = yield* $(task.workflow.getId());
    const existingId = yield* $(getTaskId(storeRef, task));

    if (existingId) {
      return existingId;
    } else {
      const taskId = yield* $(idGenerator.next('task'));
      yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[workflowId]!;
          workflow.tasks[taskId] = getInitialTaskItem(task, taskId);
          workflow.taskNameToId[task.name] = taskId;
        })
      );
      return taskId;
    }
  });
}

function ensureCondition(
  storeRef: WorkflowStateRef,
  idGenerator: IdGenerator,
  condition: Condition
) {
  return Effect.gen(function* ($) {
    const workflowId = yield* $(condition.workflow.getId());
    const existingId = yield* $(getConditionId(storeRef, condition));

    if (existingId) {
      return existingId;
    } else {
      const conditionId = yield* $(idGenerator.next('condition'));
      yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[workflowId]!;
          workflow.conditions[conditionId] = getInitialConditionItem(
            condition,
            conditionId
          );
          workflow.conditionNameToId[condition.name] = conditionId;
        })
      );
      return conditionId;
    }
  });
}

export class Memory implements StateManager {
  constructor(
    private readonly storeRef: WorkflowStateRef,
    private readonly idGenerator: IdGenerator
  ) {}

  initializeWorkflow() {
    const { storeRef, idGenerator } = this;
    return Effect.gen(function* ($) {
      const id = yield* $(idGenerator.next('workflow'));
      yield* $(
        updateStoreRef(storeRef, (draft) => {
          draft[id] = getInitialWorkflowState();
        })
      );
      return id;
    });
  }

  incrementConditionMarking(condition: Condition) {
    const { storeRef, idGenerator } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(condition.workflow.getId());

      const conditionId = yield* $(
        ensureCondition(storeRef, idGenerator, condition)
      );

      return yield* $(
        // TODO: validate that workflow exists
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[workflowID]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const conditionItem = workflow.conditions[conditionId]!;
          conditionItem.marking = conditionItem.marking + 1;
        })
      );
    });
  }
  decrementConditionMarking(condition: Condition) {
    const { storeRef, idGenerator } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(condition.workflow.getId());

      const conditionId = yield* $(
        ensureCondition(storeRef, idGenerator, condition)
      );

      return yield* $(
        // TODO: validate that workflow exists
        // TODO: validate that condition exists and has positive marking
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[workflowID]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const conditionItem = workflow.conditions[conditionId]!;
          conditionItem.marking = conditionItem.marking - 1;
        })
      );
    });
  }
  emptyConditionMarking(condition: Condition) {
    const { storeRef, idGenerator } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(condition.workflow.getId());
      const conditionId = yield* $(
        ensureCondition(storeRef, idGenerator, condition)
      );

      return yield* $(
        // TODO: validate that workflow exists
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[workflowID]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const conditionItem = workflow.conditions[conditionId]!;
          conditionItem.marking = 0;
        })
      );
    });
  }
  getConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const conditionId = yield* $(getConditionId(storeRef, condition));

      if (!conditionId) {
        return 0;
      }

      const workflowId = yield* $(condition.workflow.getId());
      const workflow = yield* $(getWorkflowById(storeRef, workflowId));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return workflow.conditions[conditionId]!.marking;
    });
  }

  updateTaskState(task: Task, taskState: WTaskState) {
    const { storeRef, idGenerator } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(task.workflow.getId());

      const taskId = yield* $(ensureTask(storeRef, idGenerator, task));

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[workflowID]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const taskItem = workflow.tasks[taskId]!;
          taskItem.state = taskState;
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
    return this.updateTaskState(task, 'cancelled');
  }
  getTaskState(task: Task) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const taskId = yield* $(getTaskId(storeRef, task));

      if (!taskId) {
        return 'disabled';
      }

      const workflowId = yield* $(task.workflow.getId());
      const workflow = yield* $(getWorkflowById(storeRef, workflowId));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return workflow.tasks[taskId]!.state;
    });
  }

  getWorkflowState(workflowId: string) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflow = yield* $(getWorkflowById(storeRef, workflowId));
      return {
        tasks: workflow.tasks,
        conditions: workflow.conditions,
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
