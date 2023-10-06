import { Prisma } from '@prisma/client';
import { Context, Effect } from 'effect';

import type { Condition } from '../../elements/Condition.js';
import type { Task } from '../../elements/Task.js';
import { Workflow } from '../../elements/Workflow.js';
import { WorkflowNotInitialized } from '../../errors.js';
import {
  type ConditionItem,
  type StateManager,
  type TaskItem,
  type WorkflowItem,
} from '../../stateManager/types.js';
import { TaskState } from '../../types.js';

export const InjectablePrismaClient = Context.Tag<Prisma.TransactionClient>();

function ensureWorkflowExists(
  prisma: Prisma.TransactionClient,
  workflow: Workflow
) {
  return Effect.tryPromise({
    try: () => {
      return prisma.workflow.findUniqueOrThrow({
        where: {
          id: workflow.id,
        },
      });
    },
    catch: () => WorkflowNotInitialized(),
  });
}

export class PrismaStateManager implements StateManager {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  initializeWorkflow(workflow: Workflow) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      yield* $(
        Effect.promise(() => {
          return prisma.workflow.create({
            data: {
              id: workflow.id,
              name: workflow.name,
              state: 'running',
            },
          });
        })
      );
    });
  }

  updateWorkflowState(workflow: Workflow, state: 'canceled' | 'done') {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(ensureWorkflowExists(prisma, workflow));

      yield* $(
        Effect.promise(() => {
          return prisma.workflow.update({
            where: {
              id: workflow.id,
            },
            data: {
              state,
            },
          });
        })
      );
    });
  }

  incrementConditionMarking(condition: Condition) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(ensureWorkflowExists(prisma, condition.workflow));

      return yield* $(
        Effect.promise(() => {
          return prisma.condition.upsert({
            create: {
              id: condition.id,
              name: condition.name,
              marking: 1,
              workflowId: condition.workflow.id,
            },
            update: { marking: { increment: 1 } },
            where: { id: condition.id },
          });
        })
      );
    });
  }

  decrementConditionMarking(condition: Condition) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(ensureWorkflowExists(prisma, condition.workflow));

      yield* $(
        Effect.promise(() => {
          return prisma.condition.upsert({
            create: {
              id: condition.id,
              name: condition.name,
              marking: 0,
              workflowId: condition.workflow.id,
            },
            update: { marking: { decrement: 1 } },
            where: { id: condition.id },
          });
        })
      );

      yield* $(
        Effect.promise(() => {
          return prisma.condition.update({
            where: {
              id: condition.id,
            },
            data: {
              marking: 0,
            },
          });
        })
      );
    });
  }

  emptyConditionMarking(condition: Condition) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(ensureWorkflowExists(prisma, condition.workflow));

      yield* $(
        Effect.promise(() => {
          return prisma.condition.upsert({
            create: {
              id: condition.id,
              name: condition.name,
              marking: 0,
              workflowId: condition.workflow.id,
            },
            update: { marking: 0 },
            where: { id: condition.id },
          });
        })
      );
    });
  }
  getConditionMarking(condition: Condition) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(ensureWorkflowExists(prisma, condition.workflow));

      const dbCondition = yield* $(
        Effect.promise(() => {
          return prisma.condition.findUnique({
            where: {
              id: condition.id,
            },
            select: { marking: true },
          });
        })
      );
      return dbCondition?.marking ?? 0;
    });
  }

  updateTaskState(task: Task, taskState: TaskState) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      yield* $(ensureWorkflowExists(prisma, task.workflow));

      return yield* $(
        Effect.promise(() => {
          return prisma.task.upsert({
            create: {
              id: task.id,
              name: task.name,
              state: taskState,
              workflowId: task.workflow.id,
            },
            update: { state: taskState },
            where: { id: task.id },
          });
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
    const { prisma } = this;
    return Effect.gen(function* ($) {
      const dbTask = yield* $(
        Effect.promise(() => {
          return prisma.task.findUnique({
            where: {
              id: task.id,
            },
            select: { state: true },
          });
        })
      );

      return (dbTask?.state ?? 'disabled') as TaskState;
    });
  }

  getWorkflowState(workflowOrId: Workflow | string) {
    const { prisma } = this;
    return Effect.gen(function* ($) {
      const workflowId =
        typeof workflowOrId === 'string' ? workflowOrId : workflowOrId.id;
      const workflowState = yield* $(
        Effect.promise(() => {
          return prisma.workflow.findUnique({
            where: { id: workflowId },
            include: {
              tasks: true,
              conditions: true,
            },
          });
        })
      );

      if (!workflowState) {
        return yield* $(Effect.fail(WorkflowNotInitialized()));
      }

      return {
        id: workflowState.id,
        name: workflowState.name,
        state: workflowState.state as WorkflowItem['state'],
        tasks: extractWorkflowTasks(workflowState.tasks as TaskItem[]),
        conditions: extractWorkflowConditions(workflowState.conditions),
      };
    });
  }
}

function extractWorkflowTasks(dbWorkflowTasks: TaskItem[]) {
  return dbWorkflowTasks.reduce<WorkflowItem['tasks']>((acc, task) => {
    acc[task.id] = {
      id: task.id,
      name: task.name,
      state: task.state as TaskState,
    };
    return acc;
  }, {});
}

function extractWorkflowConditions(dbWorkflowConditions: ConditionItem[]) {
  return dbWorkflowConditions.reduce<WorkflowItem['conditions']>(
    (acc, condition) => {
      acc[condition.id] = {
        id: condition.id,
        name: condition.name,
        marking: condition.marking,
      };
      return acc;
    },
    {}
  );
}

export function createPrisma() {
  return Effect.gen(function* ($) {
    const prisma = yield* $(InjectablePrismaClient);

    return new PrismaStateManager(prisma);
  });
}
