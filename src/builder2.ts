import * as Effect from '@effect/io/Effect';
import { cons } from '@fp-ts/optic';
import { Task } from 'vitest';

import * as AB from './builder/activity.js';
import * as TB from './builder/task.js';
import type {
  BuilderNet,
  ConditionNode,
  DefaultFlow,
  Flow,
  FlowProps,
  FlowType,
  ImplicitConditionName,
  NotExtends,
  PredicateFlow,
  XOR,
} from './types.js';

class ConditionFlow<BNTasks> {
  private readonly from: string;
  private readonly to: Set<BNTasks> = new Set<BNTasks>();
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: BNTasks) {
    this.to.add(taskName);
    return this;
  }
}

class TaskFlow<BNConditions, BNTasks> {
  private readonly from: string;
  private readonly toConditions: Set<BNConditions> = new Set<BNConditions>();
  private readonly toTasks: Set<BNTasks> = new Set<BNTasks>();
  constructor(from: string) {
    this.from = from;
  }
  task(taskName: BNTasks) {
    this.toTasks.add(taskName);
    return this;
  }
  condition(conditionName: BNConditions) {
    this.toConditions.add(conditionName);
    return this;
  }
}

type AnyFlowPredicate = (...args: any[]) => Effect.Effect<any, any, boolean>;

type ValidOrXorTaskFlow<F> = F extends OrXorTaskFlow<any, any, infer D, any>
  ? D extends true
    ? F
    : never
  : never;

class OrXorTaskFlow<
  BNConditions,
  BNTasks,
  HasDefault = never,
  Context extends object = object
> {
  private order = 0;
  private readonly from: string;
  private readonly toConditions: Record<
    string,
    { order: number; predicate: AnyFlowPredicate }
  > = {};
  private readonly toTasks: Record<
    string,
    { order: number; predicate: AnyFlowPredicate }
  > = {};
  private toDefault?: { type: 'task' | 'condition'; name: string };
  constructor(from: string) {
    this.from = from;
  }
  task<C extends object>(
    taskName: BNTasks & string,
    predicate: (context: C) => Effect.Effect<any, any, boolean>
  ): OrXorTaskFlow<BNConditions, BNTasks, HasDefault, Context & C> {
    this.order++;
    this.toTasks[taskName] = { order: this.order, predicate };
    return this;
  }
  condition<C extends object>(
    conditionName: BNTasks & string,
    predicate: (context: C) => Effect.Effect<any, any, boolean>
  ): OrXorTaskFlow<BNConditions, BNTasks, HasDefault, Context & C> {
    this.order++;
    this.toConditions[conditionName] = { order: this.order, predicate };
    return this;
  }
  defaultTask(
    taskName: BNTasks & string
  ): OrXorTaskFlow<BNConditions, BNTasks, true, Context> {
    this.toDefault = { type: 'task', name: taskName };
    return this;
  }
  defaultCondition(
    conditionName: BNConditions & string
  ): OrXorTaskFlow<BNConditions, BNTasks, true, Context> {
    this.toDefault = { type: 'condition', name: conditionName };
    return this;
  }
}

export class WorkflowBuilder<
  Context extends object,
  BNTasks = never,
  BNConditions = never,
  BNCancellationRegions = never,
  BNTasksWithOrXorSplit = never
> {
  net: BuilderNet & {
    newFlows: {
      conditions: Record<string, ConditionFlow<any>>;
      tasks: Record<string, TaskFlow<any, any> | OrXorTaskFlow<any, any>>;
    };
  };

  constructor() {
    const net: BuilderNet & {
      newFlows: {
        conditions: Record<string, ConditionFlow<any>>;
        tasks: Record<string, TaskFlow<any, any> | OrXorTaskFlow<any, any>>;
      };
    } = {
      conditions: {},
      tasks: {},
      cancellationRegions: {},
      flows: { tasks: {}, conditions: {} },
      newFlows: { conditions: {}, tasks: {} },
    };

    this.net = net;
  }

  private addConditionUnsafe(
    conditionName: string,
    props?: Omit<ConditionNode, 'name'>
  ) {
    const condition: ConditionNode = { name: conditionName, ...props };
    this.net.conditions[conditionName] = condition;
    this.net.flows.conditions[conditionName] = new Set<string>();

    return this;
  }

  private connectUnsafe(
    from: string,
    to: string,
    type: FlowType,
    props?: object
  ) {
    const flows = this.net.flows;

    if (type === 'condition->task') {
      const flowsFromConditions = flows.conditions;
      const flowsFromCondition = flowsFromConditions[from] ?? new Set<string>();
      flowsFromCondition.add(to);
      this.net.flows.conditions[from] = flowsFromCondition;
    } else if (type === 'task->condition') {
      const flowsFromTasks = flows.tasks;
      const flowsFromTask = flowsFromTasks[from] ?? {};
      flowsFromTask[to] = props ?? {};
      this.net.flows.tasks[from] = flowsFromTask;
    }
    return this;
  }

  condition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions | CN,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  > {
    return this.addConditionUnsafe(conditionName);
  }

  startCondition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions | CN,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  > {
    this.net.startCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  endCondition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions | CN,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  > {
    this.net.endCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  task<
    TN extends string,
    T extends TB.AnyTaskBuilder,
    X extends TB.TaskBuilderSplitType<T> extends 'or' | 'xor' ? TN : never
  >(
    taskName: TN & NotExtends<BNTasks | BNConditions, TN>,
    task: T
  ): WorkflowBuilder<
    Context & TB.TaskBuilderContext<T>,
    BNTasks | TN,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit | X
  >;
  task<TN extends string>(
    taskName: string & NotExtends<BNTasks | BNConditions, TN>
  ): WorkflowBuilder<
    Context,
    BNTasks | TN,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  >;
  task(taskName: string, task?: TB.AnyTaskBuilder) {
    this.net.tasks[taskName] = task ?? TB.task();

    return this;
  }

  cancellationRegion<
    TN extends BNTasks,
    TNS extends Exclude<BNTasks, TN>[],
    CNS extends BNConditions[]
  >(
    taskName: TN & NotExtends<BNCancellationRegions, TN> & string,
    toCancel: { tasks?: TNS & string[]; conditions?: CNS & string[] }
  ): WorkflowBuilder<
    Context,
    BNTasks | TN,
    BNConditions,
    BNCancellationRegions | TN,
    BNTasksWithOrXorSplit
  > {
    this.net.cancellationRegions[taskName] = toCancel;
    return this;
  }

  /*connectConditionToTask<CN extends BNConditions, TN extends BNTasks>(
    conditionNameFrom: CN & string,
    taskNameTo: TN & string
  ) {
    return this.connectUnsafe(conditionNameFrom, taskNameTo, 'condition->task');
  }

  connectTaskToCondition<
    TN extends BNTasks,
    CN extends BNConditions,
    S extends BNTasksWithOrXorSplit extends 'or' | 'xor' ? true : false,
    P extends S extends true
      ? XOR<FlowProps<PredicateFlow<Context>>, FlowProps<DefaultFlow>>
      : FlowProps<Flow>
  >(
    taskNameFrom: TN & string,
    conditionNameTo: CN & string,
    ...args: S extends true ? [P] : [P?]
  ) {
    return this.connectUnsafe(
      taskNameFrom,
      conditionNameTo,
      'task->condition',
      args[0]
    );
  }

  connectTaskToTask<
    TN1 extends BNTasks,
    TN2 extends BNTasks,
    S extends TN1 extends BNTasksWithOrXorSplit ? true : false,
    P extends S extends true
      ? XOR<
          {
            order: number;
            predicate: (...args: any) => Effect.Effect<any, any, boolean>;
          },
          DefaultFlow
        >
      : Flow
  >(
    taskNameFrom: TN1 & string,
    taskNameTo: TN2 & string,
    ...args: S extends true ? [P] : [P?]
  ): WorkflowBuilder<
    Context & P['predicate'] extends (
      context: infer R
    ) => Effect.Effect<any, any, boolean>
      ? object & R
      : object,
    BNTasks,
    BNConditions | ImplicitConditionName<TN1 & string, TN2 & string>,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  > {
    const implicitConditionName: ImplicitConditionName<
      TN1 & string,
      TN2 & string
    > = `implicit:${taskNameFrom}->${taskNameTo}`;

    return this.addConditionUnsafe(implicitConditionName, { isImplicit: true })
      .connectUnsafe(
        taskNameFrom,
        implicitConditionName,
        'task->condition',
        args[0]
      )
      .connectUnsafe(implicitConditionName, taskNameTo, 'condition->task');
  }*/
  flowCondition(
    conditionName: BNConditions & string,
    builder: (to: ConditionFlow<BNTasks>) => ConditionFlow<BNTasks>
  ) {
    this.net.newFlows.conditions[conditionName] = builder(
      new ConditionFlow(conditionName)
    );
    return this;
  }

  flowTask<T extends BNTasksWithOrXorSplit, C extends object, D>(
    taskName: T & string,
    builder: (
      to: OrXorTaskFlow<BNConditions, BNTasks>
    ) => ValidOrXorTaskFlow<OrXorTaskFlow<BNConditions, BNTasks, D, C>>
  ): WorkflowBuilder<
    Context & C,
    BNTasks,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  >;

  flowTask(
    taskName: BNTasks & string,
    builder: (
      to: TaskFlow<BNConditions, BNTasks>
    ) => TaskFlow<BNConditions, BNTasks>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit
  >;

  flowTask(taskName: string, builder: (...any: any[]) => any) {
    if (
      this.net.tasks[taskName]?.splitType === 'or' ||
      this.net.tasks[taskName]?.splitType === 'xor'
    ) {
      const flow = new OrXorTaskFlow<BNConditions, BNTasks>(taskName);
      const result: OrXorTaskFlow<BNConditions, BNTasks, true, any> =
        builder(flow);
      this.net.newFlows.tasks[taskName] = result;
    } else {
      const flow = new TaskFlow<BNConditions, BNTasks>(taskName);
      const result: TaskFlow<BNConditions, BNTasks> = builder(flow);
      this.net.newFlows.tasks[taskName] = result;
    }
    return this;
  }
}

export function workflow<C extends object>() {
  return new WorkflowBuilder<C>();
}

function isAdmin({ userId }: { userId: string }) {
  return Effect.succeed(false);
}

function isEditor({ userId }: { userId: string }) {
  return Effect.succeed(false);
}

const net = workflow()
  .startCondition('start')
  .endCondition('end')
  .task('A', TB.task({ splitType: 'xor' }))
  .task('B')
  .task('C')
  .task('D')
  .flowCondition('start', (to) => to.task('A'))
  .flowTask('A', (to) =>
    to.task('B', isAdmin).task('C', isEditor).defaultTask('D')
  )
  .flowTask('B', (to) => to.condition('end'))
  .flowTask('C', (to) => to.condition('end'))
  .flowTask('D', (to) => to.condition('end'));
/*.connectConditionToTask('start', 'A')
  .connectTaskToTask('A', 'B', {
    order: 1,
    predicate: ({ predicate1 }: { predicate1: string }) => {
      return Effect.succeed(predicate1 === 'B');
    },
  })
  .connectTaskToTask('A', 'C', {
    order: 2,
    predicate: ({ predicate2 }: { predicate2: number }) => {
      return Effect.succeed(predicate2 === 1);
    },
  })
  .connectTaskToTask('A', 'D', {
    isDefault: true,
  })
  .connectTaskToCondition('B', 'end')
  .connectTaskToCondition('C', 'end')
  .connectTaskToCondition('D', 'end');*/
