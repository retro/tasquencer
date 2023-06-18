import * as Effect from '@effect/io/Effect';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFlowPredicate = (...args: any[]) => Effect.Effect<any, any, boolean>;

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
  readonly to = new Set<BNTasks>();
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: BNTasks) {
    this.to.add(taskName);
    return this;
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
}
