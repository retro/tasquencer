import * as Effect from '@effect/io/Effect';

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

export class WorkflowBuilder<
  Context extends object,
  BNTasks = never,
  BNConditions = never,
  BNCancellationRegions = never,
  BNTasksWithOrXorSplit = never
> {
  net: BuilderNet;

  constructor() {
    const net: BuilderNet = {
      conditions: {},
      tasks: {},
      cancellationRegions: {},
      flows: { tasks: {}, conditions: {} },
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

  addCondition<CN extends string>(
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

  addStartCondition<CN extends string>(
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

  addEndCondition<CN extends string>(
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

  addTask<
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
  > {
    this.net.tasks[taskName] = task;

    return this;
  }

  addCancellationRegion<
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

  connectConditionToTask<CN extends BNConditions, TN extends BNTasks>(
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
      ? XOR<FlowProps<PredicateFlow<Context>>, FlowProps<DefaultFlow>>
      : FlowProps<Flow>
  >(
    taskNameFrom: TN1 & string,
    taskNameTo: TN2 & string,
    ...args: S extends true ? [P] : [P?]
  ): WorkflowBuilder<
    Context,
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
  }
}

export function workflow<C extends object>() {
  return new WorkflowBuilder<C>();
}

const t = TB.task({ splitType: 'or' }).onComplete(
  AB.onComplete<{ tenantId: string }>().before(() => {
    return Effect.succeed(1);
  })
);

const w = workflow<{ userId: string }>().addTask('task1', t);
