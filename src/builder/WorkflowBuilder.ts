import { Effect } from 'effect';
import { Simplify } from 'type-fest';

import { Condition } from '../elements/Condition.js';
import { Workflow } from '../elements/Workflow.js';
import {
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
} from '../errors.js';
import {
  ConditionName,
  ConditionNode,
  ElementTypes,
  NotExtends,
  TaskInstanceState,
  TaskName,
  WorkItemInstance,
  WorkflowActivities,
  WorkflowBuilderDefinition,
  WorkflowContextSym,
  WorkflowId,
  WorkflowInstance,
  WorkflowOnCancelPayload,
  WorkflowOnCompletePayload,
  WorkflowOnFailPayload,
  WorkflowOnStartPayload,
} from '../types.js';
import * as CTB from './CompositeTaskBuilder.js';
import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
  ValidOrXorTaskFlow,
} from './FlowBuilder.js';
import * as TB from './TaskBuilder.js';

type TaskWithValidContext<C, T> = C extends TB.TaskBuilderContext<T>
  ? T
  : never;

type CompositeTaskWithValidContext<C, T> =
  C extends CTB.CompositeTaskBuilderContext<T> ? T : never;

type IsXorOrOrJoinSplit<T> = T extends never
  ? never
  : T extends 'or' | 'xor'
  ? true
  : never;

export type AnyWorkflowBuilder = WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

export type AnyWorkflowBuilderWithCorrectParentContext<W, PC> =
  W extends WorkflowBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer WPC
  >
    ? PC extends WPC
      ? W
      : never
    : never;

export type WorkflowBuilderC<T> = T extends WorkflowBuilder<
  any,
  infer C,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? C
  : never;

export type WorkflowBuilderR<T> = T extends WorkflowBuilder<
  any,
  any,
  infer R,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? R
  : never;

export type WorkflowBuilderE<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  infer E,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? E
  : never;

export type WorkflowBuilderTaskActivitiesOutputs<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer AO,
  any,
  any
>
  ? AO
  : never;

export type WorkflowBuilderMetadata<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer M,
  any,
  any
>
  ? M
  : never;

export type WorkflowBuilderElementTypes<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer WAWIT,
  any
>
  ? WAWIT
  : never;

export type WorkflowBuilderTaskName<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  any,
  infer TN,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? TN
  : never;

interface WorkflowActivityMetadata<I, R> {
  input: I;
  return: R;
}

// TODO: implement invariant checking
export class WorkflowBuilder<
  WName extends string,
  WBContext,
  R,
  E,
  WBTasks = never,
  WBConditions = never,
  WBCancellationRegions = never,
  WBTasksWithOrXorSplit = never,
  WBConnectedTasks = never,
  WBConnectedConditions = never,
  WBMetadata = { [WorkflowContextSym]: WBContext },
  WBElementTypes extends ElementTypes = {
    workflow: WorkflowInstance<WBContext, WName>;
    workItem: never;
    condition: never;
    task: never;
  },
  WBParentContext = never
> {
  readonly name: string;
  readonly definition: WorkflowBuilderDefinition;
  readonly activities: WorkflowActivities<WBContext> =
    {} as WorkflowActivities<WBContext>;

  constructor(name: WName) {
    this.name = name;
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

  initialize() {
    return this.onStart((_, _input?: undefined) => Effect.succeed(_input))
      .onComplete((_, _input?: undefined) => Effect.succeed(_input))
      .onCancel((_, _input?: undefined) => Effect.succeed(_input))
      .onFail((_, _input?: undefined) => Effect.succeed(_input));
  }

  withParentContext<PC>(): WorkflowBuilder<
    WName,
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata,
    WBElementTypes,
    PC
  > {
    return this;
  }

  onStart<
    I,
    F extends (
      payload: WorkflowOnStartPayload<WBContext, WBParentContext>,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Omit<WBMetadata, 'onStart'> & {
        onStart: WorkflowActivityMetadata<
          Parameters<F>[1],
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    WBElementTypes,
    WBParentContext
  > {
    this.activities.onStart = f;
    return this;
  }
  onComplete<
    I,
    F extends (
      payload: WorkflowOnCompletePayload<WBContext, WBParentContext>,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Omit<WBMetadata, 'onComplete'> & {
        onComplete: WorkflowActivityMetadata<
          Parameters<F>[1],
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    WBElementTypes,
    WBParentContext
  > {
    this.activities.onComplete = f;
    return this;
  }

  onFail<
    I,
    F extends (
      payload: WorkflowOnFailPayload<WBContext, WBParentContext>,
      input?: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Omit<WBMetadata, 'onFail'> & {
        onFail: WorkflowActivityMetadata<
          Parameters<F>[1],
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    WBElementTypes,
    WBParentContext
  > {
    this.activities.onFail = f;
    return this;
  }

  onCancel<
    I,
    F extends (
      payload: WorkflowOnCancelPayload<WBContext, WBParentContext>,
      input?: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Omit<WBMetadata, 'onCancel'> & {
        onCancel: WorkflowActivityMetadata<
          Parameters<F>[1],
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    WBElementTypes,
    WBParentContext
  > {
    this.activities.onCancel = f;
    return this;
  }

  condition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WName,
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata,
    {
      workflow: WBElementTypes['workflow'];
      workItem: WBElementTypes['workItem'];
      condition:
        | WBElementTypes['condition']
        | {
            name: CN & ConditionName;
            workflowName: WName;
            workflowId: WorkflowId;
            marking: number;
          };
      task: WBElementTypes['task'];
    },
    WBParentContext
  > {
    return this.addConditionUnsafe(conditionName);
  }

  startCondition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WName,
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata,
    {
      workflow: WBElementTypes['workflow'];
      workItem: WBElementTypes['workItem'];
      condition:
        | WBElementTypes['condition']
        | {
            name: CN & ConditionName;
            workflowName: WName;
            workflowId: WorkflowId;
            marking: number;
          };
      task: WBElementTypes['task'];
    },
    WBParentContext
  > {
    this.definition.startCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  endCondition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WName,
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata,
    {
      workflow: WBElementTypes['workflow'];
      workItem: WBElementTypes['workItem'];
      condition:
        | WBElementTypes['condition']
        | {
            name: CN & ConditionName;
            workflowName: WName;
            workflowId: WorkflowId;
            marking: number;
          };
      task: WBElementTypes['task'];
    },
    WBParentContext
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
    WName,
    WBContext,
    R | TB.TaskBuilderR<T>,
    E | TB.TaskBuilderE<T>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      WBMetadata & {
        [tn in TN]: TB.TaskBuilderMetadata<T>;
      }
    >,
    {
      workflow: WBElementTypes['workflow'];
      workItem:
        | WBElementTypes['workItem']
        | WorkItemInstance<TB.TaskBuilderWIP<T>, WName, TN>;
      condition: WBElementTypes['condition'];
      task:
        | WBElementTypes['task']
        | {
            name: TN & TaskName;
            workflowName: WName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          };
    },
    WBParentContext
  >;
  task<
    TN extends string,
    T extends (
      t: () => TB.InitializedTaskBuilder<WBContext>
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
    WName,
    WBContext,
    R | TB.TaskBuilderR<ReturnType<T>>,
    E | TB.TaskBuilderE<ReturnType<T>>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      WBMetadata & {
        [tn in TN]: TB.TaskBuilderMetadata<ReturnType<T>>;
      }
    >,
    {
      workflow: WBElementTypes['workflow'];
      workItem:
        | WBElementTypes['workItem']
        | WorkItemInstance<TB.TaskBuilderWIP<ReturnType<T>>, WName, TN>;
      condition: WBElementTypes['condition'];
      task:
        | WBElementTypes['task']
        | {
            name: TN & TaskName;
            workflowName: WName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          };
    },
    WBParentContext
  >;
  task<TN extends string>(
    taskName: string & NotExtends<WBTasks | WBConditions, TN>
  ): WorkflowBuilder<
    WName,
    WBContext,
    R,
    E,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      WBMetadata & {
        [tn in TN]: TB.TaskBuilderMetadata<TB.AnyTaskBuilder>;
      }
    >,
    {
      workflow: WBElementTypes['workflow'];
      workItem:
        | WBElementTypes['workItem']
        | WorkItemInstance<undefined, WName, TN>;
      condition: WBElementTypes['condition'];
      task:
        | WBElementTypes['task']
        | {
            name: TN & TaskName;
            workflowName: WName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          };
    },
    WBParentContext
  >;
  task(
    taskName: string,
    input?:
      | TB.AnyTaskBuilder
      | ((t: () => TB.AnyTaskBuilder) => TB.AnyTaskBuilder)
  ) {
    if (!input) {
      this.definition.tasks[taskName] = TB.task<WBContext>();
    } else if (input instanceof TB.TaskBuilder) {
      this.definition.tasks[taskName] = input;
    } else {
      this.definition.tasks[taskName] = input(() => TB.task<WBContext>());
    }

    return this;
  }

  compositeTask<
    TN extends string,
    T extends CTB.AnyCompositeTaskBuilder<any>,
    X extends IsXorOrOrJoinSplit<
      CTB.CompositeTaskBuilderSplitType<T>
    > extends never
      ? never
      : TN
  >(
    compositeTaskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    compositeTask: T & CompositeTaskWithValidContext<WBContext, T>
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | CTB.CompositeTaskBuilderR<T>,
    E | CTB.CompositeTaskBuilderE<T>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata & {
      [tn in TN]: CTB.CompositeTaskBuilderMetadata<T>;
    },
    {
      workflow:
        | WBElementTypes['workflow']
        | CTB.CompositeTaskElementTypes<T>['workflow'];
      workItem:
        | WBElementTypes['workItem']
        | CTB.CompositeTaskElementTypes<T>['workItem'];
      condition:
        | WBElementTypes['condition']
        | CTB.CompositeTaskElementTypes<T>['condition'];
      task:
        | WBElementTypes['task']
        | {
            name: TN & TaskName;
            workflowName: WName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          }
        | CTB.CompositeTaskElementTypes<T>['task'];
    },
    WBParentContext
  >;
  compositeTask<
    TN extends string,
    T extends (
      t: () => CTB.InitialCompositeTaskFnReturnType<WBContext>
    ) => CTB.AnyCompositeTaskBuilder<WBContext>,
    X extends IsXorOrOrJoinSplit<
      CTB.CompositeTaskBuilderSplitType<ReturnType<T>>
    > extends never
      ? never
      : TN
  >(
    compositeTaskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    compositeTask: T
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | CTB.CompositeTaskBuilderR<ReturnType<T>>,
    E | CTB.CompositeTaskBuilderE<ReturnType<T>>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata & {
      [tn in TN]: CTB.CompositeTaskBuilderMetadata<ReturnType<T>>;
    },
    {
      workflow:
        | WBElementTypes['workflow']
        | CTB.CompositeTaskElementTypes<ReturnType<T>>['workflow'];
      workItem:
        | WBElementTypes['workItem']
        | CTB.CompositeTaskElementTypes<ReturnType<T>>['workItem'];
      condition:
        | WBElementTypes['condition']
        | CTB.CompositeTaskElementTypes<ReturnType<T>>['condition'];
      task:
        | WBElementTypes['task']
        | {
            name: TN & TaskName;
            workflowName: WName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          }
        | CTB.CompositeTaskElementTypes<ReturnType<T>>['task'];
    },
    WBParentContext
  >;
  compositeTask(
    compositeTaskName: string,
    input:
      | CTB.AnyCompositeTaskBuilder
      | ((t: (...args: any[]) => any) => CTB.AnyCompositeTaskBuilder<any>)
  ) {
    if (input instanceof CTB.CompositeTaskBuilder) {
      this.definition.tasks[compositeTaskName] = input;
    } else {
      this.definition.tasks[compositeTaskName] = input(() =>
        CTB.compositeTask()
      );
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
    WName,
    WBContext,
    R,
    E,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions | TN,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    WBMetadata,
    WBElementTypes,
    WBParentContext
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
    WName,
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions | CN,
    WBMetadata,
    WBElementTypes,
    WBParentContext
  > {
    this.definition.flows.conditions[conditionName] = builder(
      new ConditionFlowBuilder(conditionName)
    );
    return this;
  }

  connectTask<TN extends WBTasksWithOrXorSplit, D, R1, E1>(
    taskName: TN & NotExtends<WBConnectedTasks, TN> & string,
    builder: (
      to: OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        never,
        never,
        never,
        WBContext
      >
    ) => ValidOrXorTaskFlow<
      OrXorTaskFlowBuilder<WBConditions, WBTasks, R1, E1, D, WBContext>
    >
  ): WorkflowBuilder<
    WName,
    WBContext,
    R | R1,
    E | E1,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks | TN,
    WBConnectedConditions,
    WBMetadata,
    WBElementTypes,
    WBParentContext
  >;

  connectTask<TN extends WBTasks>(
    taskName: TN & NotExtends<WBConnectedTasks, TN> & string,
    builder: (
      to: TaskFlowBuilder<WBConditions, WBTasks>
    ) => TaskFlowBuilder<WBConditions, WBTasks>
  ): WorkflowBuilder<
    WName,
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks | TN,
    WBConnectedConditions,
    WBMetadata,
    WBElementTypes,
    WBParentContext
  >;

  connectTask(taskName: string, builder: (...any: any[]) => any) {
    if (
      this.definition.tasks[taskName]?.splitType === 'or' ||
      this.definition.tasks[taskName]?.splitType === 'xor'
    ) {
      const flow = new OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        never,
        never
      >(taskName);
      const result: OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        unknown,
        unknown,
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

  build() {
    const { name, definition, activities } = this;

    return Effect.gen(function* () {
      const workflow = new Workflow<
        R,
        E,
        WBContext,
        WBMetadata,
        WBElementTypes
      >(name, activities as unknown as WorkflowActivities<any, any>);

      for (const [taskName, taskBuilder] of Object.entries(definition.tasks)) {
        // TaskBuilder will add Task to workflow
        // This casting is ok, because task doesn't care about Workflow generics
        yield* taskBuilder.build(workflow as Workflow, taskName);
      }

      for (const [conditionName, conditionNode] of Object.entries(
        definition.conditions
      )) {
        const condition = new Condition(
          conditionName,
          conditionNode,
          // This casting is ok, because condition doesn't care about Workflow generics
          workflow as Workflow
        );

        workflow.addCondition(condition);
      }

      if (
        definition.startCondition &&
        workflow.conditions[definition.startCondition]
      ) {
        workflow.setStartCondition(definition.startCondition);
      } else {
        yield* Effect.fail(
          new StartConditionDoesNotExist({ workflowName: workflow.name })
        );
      }

      if (
        definition.endCondition &&
        workflow.conditions[definition.endCondition]
      ) {
        workflow.setEndCondition(definition.endCondition);
      } else {
        yield* Effect.fail(
          new EndConditionDoesNotExist({ workflowName: workflow.name })
        );
      }

      for (const [, conditionFlows] of Object.entries(
        definition.flows.conditions
      )) {
        // This casting is ok, because condition flow doesn't care about Workflow generics
        yield* conditionFlows.build(workflow as Workflow);
      }

      for (const [, taskFlows] of Object.entries(definition.flows.tasks)) {
        // This casting is ok, because task flow doesn't care about Workflow generics
        yield* taskFlows.build(workflow as Workflow);
      }

      for (const [taskName, cancellationRegion] of Object.entries(
        definition.cancellationRegions
      )) {
        const task = yield* workflow.getTask(taskName);
        for (const cancelledTaskName of cancellationRegion.tasks ?? []) {
          task.addTaskToCancellationRegion(
            yield* workflow.getTask(cancelledTaskName)
          );
        }
        for (const cancelledConditionName of cancellationRegion.conditions ??
          []) {
          task.addConditionToCancellationRegion(
            yield* workflow.getCondition(cancelledConditionName)
          );
        }
      }

      return workflow;
    });
  }
}

export function workflow<C>() {
  return {
    withName<N extends string>(name: N) {
      return new WorkflowBuilder<N, C, never, never>(name).initialize();
    },
  };
}
