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

export type WorkflowTasksActivitiesOutputs<T> = T extends WorkflowBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  infer O
>
  ? O
  : never;

// TODO: implement invariant checking
export class WorkflowBuilder<
  WBContext extends object,
  WBTasks = never,
  WBConditions = never,
  WBCancellationRegions = never,
  WBTasksWithOrXorSplit = never,
  WBConnectedTasks = never,
  WBConnectedConditions = never,
  WBTasksActivitiesOutputs extends Record<string, TB.ActivityOutput> = Record<
    string,
    TB.ActivityOutput
  >
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
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WBContext,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs
  > {
    return this.addConditionUnsafe(conditionName);
  }

  startCondition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WBContext,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs
  > {
    this.definition.startCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  endCondition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WBContext,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs
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
    taskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    task: T & TaskWithValidContext<WBContext, T>
  ): WorkflowBuilder<
    WBContext,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs & { [tn in TN]: TB.TaskBuilderActivityOutputs<T> }
  >;
  task<
    TN extends string,
    T extends (
      t: TB.InitializedTaskBuilder<WBContext>
    ) => TB.AnyTaskBuilder<WBContext>,
    X extends IsXorOrOrJoinSplit<
      TB.TaskBuilderSplitType<ReturnType<T>>
    > extends never
      ? never
      : TN
  >(
    taskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    task: T
  ): WorkflowBuilder<
    WBContext,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs & {
      [tn in TN]: TB.TaskBuilderActivityOutputs<ReturnType<T>>;
    }
  >;
  task<TN extends string>(
    taskName: string & NotExtends<WBTasks | WBConditions, TN>
  ): WorkflowBuilder<
    WBContext,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs & {
      [tn in TN]: TB.ActivityOutput;
    }
  >;
  task(
    taskName: string,
    input?: TB.AnyTaskBuilder | ((t: TB.AnyTaskBuilder) => TB.AnyTaskBuilder)
  ) {
    if (!input) {
      this.definition.tasks[taskName] = TB.task<WBContext>();
    } else if (input instanceof TB.TaskBuilder) {
      this.definition.tasks[taskName] = input;
    } else {
      this.definition.tasks[taskName] = input(TB.task<WBContext>());
    }

    return this;
  }

  cancellationRegion<
    TN extends WBTasks,
    TNS extends Exclude<WBTasks, TN>[],
    CNS extends WBConditions[]
  >(
    taskName: TN & NotExtends<WBCancellationRegions, TN> & string,
    toCancel: { tasks?: TNS & string[]; conditions?: CNS & string[] }
  ): WorkflowBuilder<
    WBContext,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions | TN,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs
  > {
    this.definition.cancellationRegions[taskName] = toCancel;
    return this;
  }

  connectCondition<CN extends WBConditions>(
    conditionName: CN & NotExtends<WBConnectedConditions, CN> & string,
    builder: (
      to: ConditionFlowBuilder<WBTasks>
    ) => ConditionFlowBuilder<WBTasks>
  ): WorkflowBuilder<
    WBContext,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions | CN,
    WBTasksActivitiesOutputs
  > {
    this.definition.flows.conditions[conditionName] = builder(
      new ConditionFlowBuilder(conditionName)
    );
    return this;
  }

  connectTask<TN extends WBTasksWithOrXorSplit, D>(
    taskName: TN & NotExtends<WBConnectedTasks, TN> & string,
    builder: (
      to: OrXorTaskFlowBuilder<WBConditions, WBTasks, never, WBContext>
    ) => ValidOrXorTaskFlow<
      OrXorTaskFlowBuilder<WBConditions, WBTasks, D, WBContext>
    >
  ): WorkflowBuilder<
    WBContext,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks | TN,
    WBConnectedConditions,
    WBTasksActivitiesOutputs
  >;

  connectTask<TN extends WBTasks>(
    taskName: TN & NotExtends<WBConnectedTasks, TN> & string,
    builder: (
      to: TaskFlowBuilder<WBConditions, WBTasks>
    ) => TaskFlowBuilder<WBConditions, WBTasks>
  ): WorkflowBuilder<
    WBContext,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks | TN,
    WBConnectedConditions,
    WBTasksActivitiesOutputs
  >;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectTask(taskName: string, builder: (...any: any[]) => any) {
    if (
      this.definition.tasks[taskName]?.splitType === 'or' ||
      this.definition.tasks[taskName]?.splitType === 'xor'
    ) {
      const flow = new OrXorTaskFlowBuilder<WBConditions, WBTasks>(taskName);
      const result: OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        true,
        WBContext
      > = builder(flow);
      this.definition.flows.tasks[taskName] = result;
    } else {
      const flow = new TaskFlowBuilder<WBConditions, WBTasks>(taskName);
      const result: TaskFlowBuilder<WBConditions, WBTasks> = builder(flow);
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
