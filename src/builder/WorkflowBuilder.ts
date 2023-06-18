import type {
  ConditionNode,
  NotExtends,
  WorkflowBuilderDefinition,
} from '../types.js';
import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
  ValidOrXorTaskFlow,
} from './FlowBuilder.js';
import * as TB from './TaskBuilder.js';

type TaskWithValidContext<C, T> = C extends TB.TaskBuilderUserContext<T>
  ? T
  : never;

type IsXorOrOrJoinSplit<T> = T extends never
  ? never
  : T extends 'or' | 'xor'
  ? true
  : never;

// TODO: implement invariant checking
export class WorkflowBuilder<
  Context extends object,
  BNTasks = never,
  BNConditions = never,
  BNCancellationRegions = never,
  BNTasksWithOrXorSplit = never,
  BNConnectedTasks = never,
  BNConnectedConditions = never
> {
  definition: WorkflowBuilderDefinition;

  constructor() {
    this.definition = {
      conditions: {},
      tasks: {},
      cancellationRegions: {},
      flows: { conditions: {}, tasks: {} },
    };
  }

  private addConditionUnsafe(conditionName: string, props?: ConditionNode) {
    const condition: ConditionNode = props ?? {};
    this.definition.conditions[conditionName] = condition;

    return this;
  }

  condition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions | CN,
    BNCancellationRegions,
    BNTasksWithOrXorSplit,
    BNConnectedTasks,
    BNConnectedConditions
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
    BNTasksWithOrXorSplit,
    BNConnectedTasks,
    BNConnectedConditions
  > {
    this.definition.startCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  endCondition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions | CN,
    BNCancellationRegions,
    BNTasksWithOrXorSplit,
    BNConnectedTasks,
    BNConnectedConditions
  > {
    this.definition.endCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  task<
    TN extends string,
    T extends TB.AnyTaskBuilder,
    X extends IsXorOrOrJoinSplit<TB.TaskBuilderSplitType<T>> extends never
      ? never
      : TN
  >(
    taskName: TN & NotExtends<BNTasks | BNConditions, TN>,
    task: T & TaskWithValidContext<Context, T>
  ): WorkflowBuilder<
    Context,
    BNTasks | TN,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit | X,
    BNConnectedTasks,
    BNConnectedConditions
  >;
  task<
    TN extends string,
    T extends (
      t: TB.InitializedTaskBuilder<Context>
    ) => TB.AnyTaskBuilder<Context>,
    X extends IsXorOrOrJoinSplit<
      TB.TaskBuilderSplitType<ReturnType<T>>
    > extends never
      ? never
      : TN
  >(
    taskName: TN & NotExtends<BNTasks | BNConditions, TN>,
    task: T
  ): WorkflowBuilder<
    Context,
    BNTasks | TN,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit | X,
    BNConnectedTasks,
    BNConnectedConditions
  >;
  task<TN extends string>(
    taskName: string & NotExtends<BNTasks | BNConditions, TN>
  ): WorkflowBuilder<
    Context,
    BNTasks | TN,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit,
    BNConnectedTasks,
    BNConnectedConditions
  >;
  task(
    taskName: string,
    input?: TB.AnyTaskBuilder | ((t: TB.AnyTaskBuilder) => TB.AnyTaskBuilder)
  ) {
    if (!input) {
      this.definition.tasks[taskName] = TB.task<Context>();
    } else if (input instanceof TB.TaskBuilder) {
      this.definition.tasks[taskName] = input;
    } else {
      this.definition.tasks[taskName] = input(TB.task<Context>());
    }

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
    BNTasksWithOrXorSplit,
    BNConnectedTasks,
    BNConnectedConditions
  > {
    this.definition.cancellationRegions[taskName] = toCancel;
    return this;
  }

  connectCondition<CN extends BNConditions>(
    conditionName: CN & NotExtends<BNConnectedConditions, CN> & string,
    builder: (
      to: ConditionFlowBuilder<BNTasks>
    ) => ConditionFlowBuilder<BNTasks>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit,
    BNConnectedTasks,
    BNConnectedConditions | CN
  > {
    this.definition.flows.conditions[conditionName] = builder(
      new ConditionFlowBuilder(conditionName)
    );
    return this;
  }

  connectTask<TN extends BNTasksWithOrXorSplit, D>(
    taskName: TN & NotExtends<BNConnectedTasks, TN> & string,
    builder: (
      to: OrXorTaskFlowBuilder<BNConditions, BNTasks, never, Context>
    ) => ValidOrXorTaskFlow<
      OrXorTaskFlowBuilder<BNConditions, BNTasks, D, Context>
    >
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit,
    BNConnectedTasks | TN,
    BNConnectedConditions
  >;

  connectTask<TN extends BNTasks>(
    taskName: TN & NotExtends<BNConnectedTasks, TN> & string,
    builder: (
      to: TaskFlowBuilder<BNConditions, BNTasks>
    ) => TaskFlowBuilder<BNConditions, BNTasks>
  ): WorkflowBuilder<
    Context,
    BNTasks,
    BNConditions,
    BNCancellationRegions,
    BNTasksWithOrXorSplit,
    BNConnectedTasks | TN,
    BNConnectedConditions
  >;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectTask(taskName: string, builder: (...any: any[]) => any) {
    if (
      this.definition.tasks[taskName]?.splitType === 'or' ||
      this.definition.tasks[taskName]?.splitType === 'xor'
    ) {
      const flow = new OrXorTaskFlowBuilder<BNConditions, BNTasks>(taskName);
      const result: OrXorTaskFlowBuilder<BNConditions, BNTasks, true, Context> =
        builder(flow);
      this.definition.flows.tasks[taskName] = result;
    } else {
      const flow = new TaskFlowBuilder<BNConditions, BNTasks>(taskName);
      const result: TaskFlowBuilder<BNConditions, BNTasks> = builder(flow);
      this.definition.flows.tasks[taskName] = result;
    }
    return this;
  }
}

export function workflow<C extends object>() {
  return new WorkflowBuilder<C>();
}

/*function isAdmin({ context }: { context: { userId: string } }) {
  return Effect.succeed(false);
}

function isEditor({ context }: { context: { userId: string } }) {
  return Effect.succeed(false);
}

const t = TB.task<{ foo: string }>();

const net = workflow<{ userId: string }>()
  .startCondition('start')
  .endCondition('end')
  .task('A', (t) =>
    t
      .withSplitType('xor')
      .onActivate((a) => a.before(() => Effect.succeed(1)))
      .onDisable((a) => a.procedure(() => Effect.succeed(1)))
  )
  .task('B')
  .task('C')
  .task('D')
  .flowCondition('start', (to) => to.task('A'))
  .flowTask('A', (to) =>
    to.task('B', isAdmin).task('C', isEditor).defaultTask('D')
  )
  .flowTask('B', (to) => to.condition('end'))
  .flowTask('C', (to) => to.condition('end'))
  .flowTask('D', (to) => to.condition('end'));*/
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
