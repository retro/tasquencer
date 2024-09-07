import { Effect } from 'effect';

import { Condition } from '../elements/Condition.js';
import {
  ConditionToTaskFlow,
  TaskToConditionFlow,
  TaskToConditionFlowProps,
} from '../elements/Flow.js';
import { Workflow } from '../elements/Workflow.js';

type AnyFlowPredicate = (
  ...args: any[]
) => Effect.Effect<boolean, unknown, unknown>;

export type ValidOrXorTaskFlow<F> = F extends OrXorTaskFlowBuilder<
  any,
  any,
  any,
  any,
  infer THasDefault,
  any
>
  ? THasDefault extends true
    ? F
    : never
  : never;

export class ConditionFlowBuilder<TTasks> {
  private readonly from: string;
  readonly to = new Set<TTasks & string>();
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: TTasks & string) {
    this.to.add(taskName);
    return this;
  }
  build(workflow: Workflow) {
    const { from, to } = this;
    return Effect.gen(function* () {
      const condition = yield* workflow.getCondition(from);

      for (const taskName of to) {
        const task = yield* workflow.getTask(taskName);
        const flow = new ConditionToTaskFlow(condition, task);
        task.addIncomingFlow(flow);
        condition.addOutgoingFlow(flow);
      }
    });
  }
}

export class TaskFlowBuilder<TConditions, TTasks> {
  private readonly from: string;
  readonly toConditions: Record<string, object> = {};
  readonly toTasks: Record<string, object> = {};
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: TTasks & string) {
    this.toTasks[taskName] = {};
    return this;
  }
  condition(conditionName: TConditions & string) {
    this.toConditions[conditionName] = {};
    return this;
  }
  build(workflow: Workflow) {
    const { from, toConditions, toTasks } = this;
    return Effect.gen(function* () {
      const task = yield* workflow.getTask(from);

      for (const [conditionName, props] of Object.entries(toConditions)) {
        const condition = yield* workflow.getCondition(conditionName);
        const flow = new TaskToConditionFlow(task, condition, props);
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }

      for (const [toTaskName, props] of Object.entries(toTasks)) {
        const toTask = yield* workflow.getTask(toTaskName);
        const conditionName = `implicit:${from}->${toTask.name}`;
        const condition = new Condition(
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
  TConditions,
  TTasks,
  R = never,
  E = never,
  THasDefault = never,
  TContext = unknown
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
  task<TTaskR, TTaskE>(
    taskName: TTasks & string,
    predicate: (payload: {
      context: TContext;
    }) => Effect.Effect<boolean, TTaskE, TTaskR>
  ): OrXorTaskFlowBuilder<
    TConditions,
    TTasks,
    R | TTaskR,
    E | TTaskE,
    THasDefault,
    TContext
  > {
    this.order++;
    this.toTasks[taskName] = { order: this.order, predicate };
    return this;
  }
  condition<TConditionR, TConditionE>(
    conditionName: TTasks & string,
    predicate: (payload: {
      context: TContext;
    }) => Effect.Effect<boolean, TConditionE, TConditionR>
  ): OrXorTaskFlowBuilder<
    TConditions,
    TTasks,
    R | TConditionR,
    E | TConditionE,
    THasDefault,
    TContext
  > {
    this.order++;
    this.toConditions[conditionName] = { order: this.order, predicate };
    return this;
  }
  defaultTask(
    taskName: TTasks & string
  ): OrXorTaskFlowBuilder<TConditions, TTasks, R, E, true, TContext> {
    this.toDefault = { type: 'task', name: taskName };
    return this;
  }
  defaultCondition(
    conditionName: TConditions & string
  ): OrXorTaskFlowBuilder<TConditions, TTasks, R, E, true, TContext> {
    this.toDefault = { type: 'condition', name: conditionName };
    return this;
  }
  build(workflow: Workflow) {
    const { from, toConditions, toTasks, toDefault } = this;
    return Effect.gen(function* () {
      const task = yield* workflow.getTask(from);

      for (const [conditionName, props] of Object.entries(toConditions)) {
        const condition = yield* workflow.getCondition(conditionName);
        // Cast props as TaskToConditionFlowProps because we capture the
        // real type signature elsewhere, which will be used by the
        // Interpreter to generate the real return type from the entry points
        // (startTask and completeTask)
        const flow = new TaskToConditionFlow(
          task,
          condition,
          props as TaskToConditionFlowProps
        );
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }

      for (const [toTaskName, props] of Object.entries(toTasks)) {
        const toTask = yield* workflow.getTask(toTaskName);
        const conditionName = `implicit:${from}->${toTask.name}`;
        const condition = new Condition(
          conditionName,
          { isImplicit: true },
          workflow
        );

        workflow.addCondition(condition);

        // Cast props as TaskToConditionFlowProps because we capture the
        // real type signature elsewhere, which will be used by the
        // Interpreter to generate the real return type from the entry points
        // (startTask and completeTask)
        const leftFlow = new TaskToConditionFlow(
          task,
          condition,
          props as TaskToConditionFlowProps
        );
        const rightFlow = new ConditionToTaskFlow(condition, toTask);
        task.addOutgoingFlow(leftFlow);
        condition.addIncomingFlow(leftFlow);
        condition.addOutgoingFlow(rightFlow);
        toTask.addIncomingFlow(rightFlow);
      }

      const defaultFlow = toDefault;
      if (defaultFlow?.type === 'task') {
        const toTask = yield* workflow.getTask(defaultFlow.name);
        const conditionName = `implicit:${from}->${toTask.name}`;
        const condition = new Condition(
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
        const condition = yield* workflow.getCondition(defaultFlow.name);
        const flow = new TaskToConditionFlow(task, condition, {
          order: Infinity,
          isDefault: true,
        });
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }
    });
  }
}
