import * as Effect from '@effect/io/Effect';

import { Condition } from '../elements/Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from '../elements/Flow.js';
import { Workflow } from '../elements/Workflow.js';
import { IdProvider } from './IdProvider.js';

type AnyFlowPredicate = (
  ...args: any[]
) => Effect.Effect<never, never, boolean>;

export type ValidOrXorTaskFlow<F> = F extends OrXorTaskFlowBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  infer D,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>
  ? D extends true
    ? F
    : never
  : never;

export class ConditionFlowBuilder<BNTasks> {
  private readonly from: string;
  readonly to = new Set<BNTasks & string>();
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: BNTasks & string) {
    this.to.add(taskName);
    return this;
  }
  build(workflow: Workflow) {
    const { from, to } = this;
    return Effect.gen(function* ($) {
      const condition = yield* $(workflow.getCondition(from));

      for (const taskName of to) {
        const task = yield* $(workflow.getTask(taskName));
        const flow = new ConditionToTaskFlow(condition, task);
        task.addIncomingFlow(flow);
        condition.addOutgoingFlow(flow);
      }
    });
  }
}

export class TaskFlowBuilder<BNConditions, BNTasks> {
  private readonly from: string;
  readonly toConditions: Record<string, object> = {};
  readonly toTasks: Record<string, object> = {};
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: BNTasks & string) {
    this.toTasks[taskName] = {};
    return this;
  }
  condition(conditionName: BNConditions & string) {
    this.toConditions[conditionName] = {};
    return this;
  }
  build(workflow: Workflow, idProvider: IdProvider) {
    const { from, toConditions, toTasks } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(from));

      for (const [conditionName, props] of Object.entries(toConditions)) {
        const condition = yield* $(workflow.getCondition(conditionName));
        const flow = new TaskToConditionFlow(task, condition, props);
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }

      for (const [toTaskName, props] of Object.entries(toTasks)) {
        const toTask = yield* $(workflow.getTask(toTaskName));
        const conditionName = `implicit:${from}->${toTask.name}`;
        const condition = new Condition(
          yield* $(idProvider.getConditionId(conditionName)),
          conditionName,
          { isImplicit: true },
          workflow
        );

        workflow.addCondition(condition);

        const leftFlow = new TaskToConditionFlow(task, condition, props);
        const rightFlow = new ConditionToTaskFlow(condition, toTask);
        task.addOutgoingFlow(leftFlow);
        condition.addIncomingFlow(leftFlow);
        condition.addOutgoingFlow(rightFlow);
        toTask.addIncomingFlow(rightFlow);
      }
    });
  }
}

export class OrXorTaskFlowBuilder<
  BNConditions,
  BNTasks,
  HasDefault = never,
  Context extends object = object
> {
  private order = 0;
  readonly from: string;
  readonly toConditions: Record<
    string,
    { order: number; predicate: AnyFlowPredicate }
  > = {};
  readonly toTasks: Record<
    string,
    { order: number; predicate: AnyFlowPredicate }
  > = {};
  toDefault?: { type: 'task' | 'condition'; name: string };
  constructor(from: string) {
    this.from = from;
  }
  task(
    taskName: BNTasks & string,
    predicate: (payload: {
      context: Context;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) => Effect.Effect<any, any, boolean>
  ): OrXorTaskFlowBuilder<BNConditions, BNTasks, HasDefault, Context> {
    this.order++;
    this.toTasks[taskName] = { order: this.order, predicate };
    return this;
  }
  condition(
    conditionName: BNTasks & string,
    predicate: (payload: {
      context: Context;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) => Effect.Effect<any, any, boolean>
  ): OrXorTaskFlowBuilder<BNConditions, BNTasks, HasDefault, Context> {
    this.order++;
    this.toConditions[conditionName] = { order: this.order, predicate };
    return this;
  }
  defaultTask(
    taskName: BNTasks & string
  ): OrXorTaskFlowBuilder<BNConditions, BNTasks, true, Context> {
    this.toDefault = { type: 'task', name: taskName };
    return this;
  }
  defaultCondition(
    conditionName: BNConditions & string
  ): OrXorTaskFlowBuilder<BNConditions, BNTasks, true, Context> {
    this.toDefault = { type: 'condition', name: conditionName };
    return this;
  }
  build(workflow: Workflow, idProvider: IdProvider) {
    const { from, toConditions, toTasks, toDefault } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(from));

      for (const [conditionName, props] of Object.entries(toConditions)) {
        const condition = yield* $(workflow.getCondition(conditionName));
        const flow = new TaskToConditionFlow(task, condition, props);
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }

      for (const [toTaskName, props] of Object.entries(toTasks)) {
        const toTask = yield* $(workflow.getTask(toTaskName));
        const conditionName = `implicit:${from}->${toTask.name}`;
        const condition = new Condition(
          yield* $(idProvider.getConditionId(conditionName)),
          conditionName,
          { isImplicit: true },
          workflow
        );

        workflow.addCondition(condition);

        const leftFlow = new TaskToConditionFlow(task, condition, props);
        const rightFlow = new ConditionToTaskFlow(condition, toTask);
        task.addOutgoingFlow(leftFlow);
        condition.addIncomingFlow(leftFlow);
        condition.addOutgoingFlow(rightFlow);
        toTask.addIncomingFlow(rightFlow);
      }

      const defaultFlow = toDefault;
      if (defaultFlow?.type === 'task') {
        const toTask = yield* $(workflow.getTask(defaultFlow.name));
        const conditionName = `implicit:${from}->${toTask.name}`;
        const condition = new Condition(
          yield* $(idProvider.getConditionId(conditionName)),
          conditionName,
          { isImplicit: true },
          workflow
        );

        workflow.addCondition(condition);

        const leftFlow = new TaskToConditionFlow(task, condition, {
          order: Infinity,
          isDefault: true,
        });
        const rightFlow = new ConditionToTaskFlow(condition, toTask);
        task.addOutgoingFlow(leftFlow);
        condition.addIncomingFlow(leftFlow);
        condition.addOutgoingFlow(rightFlow);
        toTask.addIncomingFlow(rightFlow);
      } else if (defaultFlow?.type === 'condition') {
        const condition = yield* $(workflow.getCondition(defaultFlow.name));
        const flow = new TaskToConditionFlow(task, condition);
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }
    });
  }
}
