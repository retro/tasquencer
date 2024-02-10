import { Get, Simplify } from 'type-fest';

import type { WorkflowBuilderElementTypes } from './builder/WorkflowBuilder.js';

export * as Builder from './builder.js';
export * as Service from './Service.js';

export * as TaskBuilder from './builder/TaskBuilder.js';
export * from './types.js';
export * from './errors.js';

export type WorkflowBuilderWorkflow<T> = Simplify<
  Get<WorkflowBuilderElementTypes<T>, 'workflow'>
>;

export type WorkflowBuilderWorkItem<T> = Simplify<
  Get<WorkflowBuilderElementTypes<T>, 'workItem'>
>;

export type WorkflowBuilderExplicitCondition<T> = Simplify<
  Get<WorkflowBuilderElementTypes<T>, 'condition'>
>;

export type WorkflowBuilderTask<T> = Simplify<
  Get<WorkflowBuilderElementTypes<T>, 'task'>
>;
