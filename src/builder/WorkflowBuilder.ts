import { Effect } from 'effect';

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
  ReplaceProp,
  TaggedMetadata,
  TaskInstanceState,
  TaskName,
  UnknownAsUndefined,
  WorkItemInstance,
  WorkflowActivities,
  WorkflowBuilderDefinition,
  WorkflowBuilderMetadata,
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

type TaskWithValidContext<TContext, TTaskBuilder> =
  TContext extends TB.GetTaskBuilderContext<TTaskBuilder>
    ? TTaskBuilder
    : never;

type CompositeTaskWithValidContext<TContext, TCompositeTaskBuilder> =
  TContext extends CTB.GetCompositeTaskBuilderContext<TCompositeTaskBuilder>
    ? TCompositeTaskBuilder
    : never;

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
  any
>;

export type GetWorkflowBuilderContext<TWorkflowBuilder> =
  TWorkflowBuilder extends WorkflowBuilder<
    any,
    infer TContext,
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
    ? TContext
    : never;

export type GetWorkflowBuilderR<TWorkflowBuilder> =
  TWorkflowBuilder extends WorkflowBuilder<
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
    any
  >
    ? R
    : never;

export type GetWorkflowBuilderE<TWorkflowBuilder> =
  TWorkflowBuilder extends WorkflowBuilder<
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
    any
  >
    ? E
    : never;

export type GetWorkflowBuilderMetadata<TWorkflowBuilder> =
  TWorkflowBuilder extends WorkflowBuilder<
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
    infer TWorkflowBuilderMetadata,
    any
  >
    ? TWorkflowBuilderMetadata
    : never;

export type GetWorkflowBuilderElementTypes<TWorkflowBuilder> =
  TWorkflowBuilder extends WorkflowBuilder<
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
    infer TElementTypes
  >
    ? TElementTypes
    : never;

export type GetWorkflowBuilderTaskNames<TWorkflowBuilder> =
  TWorkflowBuilder extends WorkflowBuilder<
    any,
    any,
    any,
    any,
    infer TTaskNames,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
    ? TTaskNames
    : never;

interface WorkflowActivityMetadata<TInput, TReturnType> {
  input: TInput;
  return: TReturnType;
}

// TODO: implement invariant checking
export class WorkflowBuilder<
  TWorkflowName extends string,
  TContext,
  R,
  E,
  TTasks = never,
  TConditions = never,
  TCancellationRegions = never,
  TTasksWithOrXorSplit = never,
  TConnectedTasks = never,
  TConnectedConditions = never,
  TMetadata extends WorkflowBuilderMetadata = {
    name: TWorkflowName;
    context: TContext;
    tasks: Record<never, never>;
    compositeTasks: Record<never, never>;
    onStart: { input: undefined; return: undefined };
    onCancel: { input: undefined; return: undefined };
    onComplete: { input: undefined; return: undefined };
    onFail: { input: undefined; return: undefined };
  },
  TElementTypes extends ElementTypes = {
    workflow: WorkflowInstance<TContext, TWorkflowName>;
    workItem: never;
    condition: never;
    task: never;
  }
> {
  readonly name: string;
  readonly definition: WorkflowBuilderDefinition;
  readonly activities: WorkflowActivities<TContext> =
    {} as WorkflowActivities<TContext>;

  constructor(name: TWorkflowName) {
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

  onStart<
    TOnStartActivityInput,
    TOnStartActivity extends (
      payload: WorkflowOnStartPayload<TContext>,
      input: TOnStartActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnStartActivity
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | Effect.Effect.Context<ReturnType<TOnStartActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnStartActivity>>,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    ReplaceProp<
      'onStart',
      TMetadata,
      WorkflowActivityMetadata<
        Parameters<TOnStartActivity>[1],
        Effect.Effect.Success<ReturnType<TOnStartActivity>>
      >
    >,
    TElementTypes
  > {
    this.activities.onStart = f;
    return this;
  }
  onComplete<
    TOnCompleteActivityInput,
    TOnCompleteActivity extends (
      payload: WorkflowOnCompletePayload<TContext>,
      input: TOnCompleteActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCompleteActivity
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | Effect.Effect.Context<ReturnType<TOnCompleteActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCompleteActivity>>,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    ReplaceProp<
      'onComplete',
      TMetadata,
      WorkflowActivityMetadata<
        Parameters<TOnCompleteActivity>[1],
        Effect.Effect.Success<ReturnType<TOnCompleteActivity>>
      >
    >,
    TElementTypes
  > {
    this.activities.onComplete = f;
    return this;
  }

  onFail<
    TOnFailActivityInput,
    TOnFailActivity extends (
      payload: WorkflowOnFailPayload<TContext>,
      input: TOnFailActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnFailActivity
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | Effect.Effect.Context<ReturnType<TOnFailActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnFailActivity>>,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    ReplaceProp<
      'onFail',
      TMetadata,
      WorkflowActivityMetadata<
        Parameters<TOnFailActivity>[1],
        Effect.Effect.Success<ReturnType<TOnFailActivity>>
      >
    >,
    TElementTypes
  > {
    this.activities.onFail = f;
    return this;
  }

  onCancel<
    TOnCancelActivityInput,
    TOnCancelActivity extends (
      payload: WorkflowOnCancelPayload<TContext>,
      input: TOnCancelActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCancelActivity
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | Effect.Effect.Context<ReturnType<TOnCancelActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCancelActivity>>,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    ReplaceProp<
      'onCancel',
      TMetadata,
      WorkflowActivityMetadata<
        Parameters<TOnCancelActivity>[1],
        Effect.Effect.Success<ReturnType<TOnCancelActivity>>
      >
    >,
    TElementTypes
  > {
    this.activities.onCancel = f;
    return this;
  }

  condition<TConditionName extends string>(
    conditionName: TConditionName &
      NotExtends<TTasks | TConditions, TConditionName>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks,
    TConditions | TConditionName,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata,
    {
      workflow: TElementTypes['workflow'];
      workItem: TElementTypes['workItem'];
      condition:
        | TElementTypes['condition']
        | {
            name: TConditionName & ConditionName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            marking: number;
          };
      task: TElementTypes['task'];
    }
  > {
    return this.addConditionUnsafe(conditionName);
  }

  startCondition<TStartConditionName extends string>(
    conditionName: TStartConditionName &
      NotExtends<TTasks | TConditions, TStartConditionName>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks,
    TConditions | TStartConditionName,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata,
    {
      workflow: TElementTypes['workflow'];
      workItem: TElementTypes['workItem'];
      condition:
        | TElementTypes['condition']
        | {
            name: TStartConditionName & ConditionName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            marking: number;
          };
      task: TElementTypes['task'];
    }
  > {
    this.definition.startCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  endCondition<TEndConditionName extends string>(
    conditionName: TEndConditionName &
      NotExtends<TTasks | TConditions, TEndConditionName>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks,
    TConditions | TEndConditionName,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata,
    {
      workflow: TElementTypes['workflow'];
      workItem: TElementTypes['workItem'];
      condition:
        | TElementTypes['condition']
        | {
            name: TEndConditionName & ConditionName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            marking: number;
          };
      task: TElementTypes['task'];
    }
  > {
    this.definition.endCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  task<
    TTaskName extends string,
    TTaskBuilder extends TB.AnyTaskBuilder,
    TIsXorOrOrJoinSplit extends IsXorOrOrJoinSplit<
      TB.GetTaskBuilderSplitType<TTaskBuilder>
    > extends never
      ? never
      : TTaskName
  >(
    taskName: TTaskName & NotExtends<TTasks | TConditions, TTaskName>,
    task: TTaskBuilder & TaskWithValidContext<TContext, TTaskBuilder>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | TB.GetTaskBuilderR<TTaskBuilder>,
    E | TB.GetTaskBuilderE<TTaskBuilder>,
    TTasks | TTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | TIsXorOrOrJoinSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      tasks: {
        [TName in TTaskName]: {
          type: 'task';
          name: TName;
          metadata: TaggedMetadata<
            TB.GetTaskBuilderTaskMetadata<TTaskBuilder>,
            TName
          >;
          workItemMetadata: TaggedMetadata<
            TB.GetTaskBuilderWorkItemMetadata<TTaskBuilder>,
            TName
          >;
        };
      };
    },
    {
      workflow: TElementTypes['workflow'];
      workItem:
        | TElementTypes['workItem']
        | WorkItemInstance<
            TB.GetTaskBuilderWorkItemPayload<TTaskBuilder>,
            TWorkflowName,
            TTaskName
          >;
      condition: TElementTypes['condition'];
      task:
        | TElementTypes['task']
        | {
            name: TTaskName & TaskName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          };
    }
  >;
  task<
    TTaskName extends string,
    TTaskBuilderInit extends (
      t: () => TB.InitializedTaskBuilder<TContext>
    ) => TB.AnyTaskBuilder<TContext>,
    X extends IsXorOrOrJoinSplit<
      TB.GetTaskBuilderSplitType<ReturnType<TTaskBuilderInit>>
    > extends never
      ? never
      : TTaskName
  >(
    taskName: TTaskName & NotExtends<TTasks | TConditions, TTaskName>,
    task: TTaskBuilderInit
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | TB.GetTaskBuilderR<ReturnType<TTaskBuilderInit>>,
    E | TB.GetTaskBuilderE<ReturnType<TTaskBuilderInit>>,
    TTasks | TTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | X,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      tasks: {
        [TName in TTaskName]: {
          type: 'task';
          name: TName;
          metadata: TaggedMetadata<
            TB.GetTaskBuilderTaskMetadata<ReturnType<TTaskBuilderInit>>,
            TName
          >;
          workItemMetadata: TaggedMetadata<
            TB.GetTaskBuilderWorkItemMetadata<ReturnType<TTaskBuilderInit>>,
            TName
          >;
        };
      };
    },
    {
      workflow: TElementTypes['workflow'];
      workItem:
        | TElementTypes['workItem']
        | WorkItemInstance<
            TB.GetTaskBuilderWorkItemPayload<ReturnType<TTaskBuilderInit>>,
            TWorkflowName,
            TTaskName
          >;
      condition: TElementTypes['condition'];
      task:
        | TElementTypes['task']
        | {
            name: TTaskName & TaskName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          };
    }
  >;
  task<TTaskName extends string>(
    taskName: string & NotExtends<TTasks | TConditions, TTaskName>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks | TTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      tasks: {
        [TName in TTaskName]: {
          type: 'task';
          name: TName;
          metadata: TaggedMetadata<
            TB.GetTaskBuilderTaskMetadata<TB.AnyTaskBuilder>,
            TName
          >;
          workItemMetadata: TaggedMetadata<
            TB.GetTaskBuilderWorkItemMetadata<TB.AnyTaskBuilder>,
            TName
          >;
        };
      };
    },
    {
      workflow: TElementTypes['workflow'];
      workItem:
        | TElementTypes['workItem']
        | WorkItemInstance<undefined, TWorkflowName, TTaskName>;
      condition: TElementTypes['condition'];
      task:
        | TElementTypes['task']
        | {
            name: TTaskName & TaskName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          };
    }
  >;
  task(
    taskName: string,
    input?:
      | TB.AnyTaskBuilder
      | ((t: () => TB.AnyTaskBuilder) => TB.AnyTaskBuilder)
  ) {
    if (!input) {
      this.definition.tasks[taskName] = TB.task<TContext>();
    } else if (input instanceof TB.TaskBuilder) {
      this.definition.tasks[taskName] = input;
    } else {
      this.definition.tasks[taskName] = input(() => TB.task<TContext>());
    }

    return this;
  }

  compositeTask<
    TCompositeTaskName extends string,
    TCompositeTaskBuilder extends CTB.AnyCompositeTaskBuilder<any, any>,
    TIsXorOrOrJoinSplit extends IsXorOrOrJoinSplit<
      CTB.GetCompositeTaskBuilderSplitType<TCompositeTaskBuilder>
    > extends never
      ? never
      : TCompositeTaskName
  >(
    compositeTaskName: TCompositeTaskName &
      NotExtends<TTasks | TConditions, TCompositeTaskName>,
    compositeTask: TCompositeTaskBuilder &
      CompositeTaskWithValidContext<TContext, TCompositeTaskBuilder>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | CTB.GetCompositeTaskBuilderR<TCompositeTaskBuilder>,
    E | CTB.GetCompositeTaskBuilderE<TCompositeTaskBuilder>,
    TTasks | TCompositeTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | TIsXorOrOrJoinSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      compositeTasks: {
        [TName in TCompositeTaskName]: {
          type: 'compositeTask';
          name: TName;
          metadata: TaggedMetadata<
            CTB.GetCompositeTaskBuilderCompositeTaskMetadata<TCompositeTaskBuilder>,
            TName
          >;
          workflowMetadata: TaggedMetadata<
            CTB.GetCompositeTaskBuilderWorkflowMetadata<TCompositeTaskBuilder>,
            TName
          >;
        };
      };
    },
    {
      workflow:
        | TElementTypes['workflow']
        | CTB.GetCompositeTaskElementTypes<TCompositeTaskBuilder>['workflow'];
      workItem:
        | TElementTypes['workItem']
        | CTB.GetCompositeTaskElementTypes<TCompositeTaskBuilder>['workItem'];
      condition:
        | TElementTypes['condition']
        | CTB.GetCompositeTaskElementTypes<TCompositeTaskBuilder>['condition'];
      task:
        | TElementTypes['task']
        | {
            name: TCompositeTaskName & TaskName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          }
        | CTB.GetCompositeTaskElementTypes<TCompositeTaskBuilder>['task'];
    }
  >;
  compositeTask<
    TCompositeTaskName extends string,
    TCompositeTaskBuilderInit extends (
      t: () => CTB.InitialCompositeTaskFnReturnType<TContext>
    ) => CTB.AnyCompositeTaskBuilder<TContext, any>,
    X extends IsXorOrOrJoinSplit<
      CTB.GetCompositeTaskBuilderSplitType<
        ReturnType<TCompositeTaskBuilderInit>
      >
    > extends never
      ? never
      : TCompositeTaskName
  >(
    compositeTaskName: TCompositeTaskName &
      NotExtends<TTasks | TConditions, TCompositeTaskName>,
    compositeTask: TCompositeTaskBuilderInit
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | CTB.GetCompositeTaskBuilderR<ReturnType<TCompositeTaskBuilderInit>>,
    E | CTB.GetCompositeTaskBuilderE<ReturnType<TCompositeTaskBuilderInit>>,
    TTasks | TCompositeTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | X,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      compositeTasks: {
        [TName in TCompositeTaskName]: {
          type: 'compositeTask';
          name: TName;
          metadata: TaggedMetadata<
            CTB.GetCompositeTaskBuilderCompositeTaskMetadata<
              ReturnType<TCompositeTaskBuilderInit>
            >,
            TName
          >;
          workflowMetadata: TaggedMetadata<
            CTB.GetCompositeTaskBuilderWorkflowMetadata<
              ReturnType<TCompositeTaskBuilderInit>
            >,
            TName
          >;
        };
      };
    },
    {
      workflow:
        | TElementTypes['workflow']
        | CTB.GetCompositeTaskElementTypes<
            ReturnType<TCompositeTaskBuilderInit>
          >['workflow'];
      workItem:
        | TElementTypes['workItem']
        | CTB.GetCompositeTaskElementTypes<
            ReturnType<TCompositeTaskBuilderInit>
          >['workItem'];
      condition:
        | TElementTypes['condition']
        | CTB.GetCompositeTaskElementTypes<
            ReturnType<TCompositeTaskBuilderInit>
          >['condition'];
      task:
        | TElementTypes['task']
        | {
            name: TCompositeTaskName & TaskName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          }
        | CTB.GetCompositeTaskElementTypes<
            ReturnType<TCompositeTaskBuilderInit>
          >['task'];
    }
  >;
  compositeTask(
    compositeTaskName: string,
    input:
      | CTB.AnyCompositeTaskBuilder
      | ((t: (...args: any[]) => any) => CTB.AnyCompositeTaskBuilder<any, any>)
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
    TTaskName extends TTasks,
    TCancellableTaskNames extends Exclude<TTasks, TTaskName>[],
    TConditionNames extends TConditions[]
  >(
    taskName: TTaskName & NotExtends<TCancellationRegions, TTaskName> & string,
    toCancel: {
      tasks?: TCancellableTaskNames & string[];
      conditions?: TConditionNames & string[];
    }
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks | TTaskName,
    TConditions,
    TCancellationRegions | TTaskName,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata,
    TElementTypes
  > {
    this.definition.cancellationRegions[taskName] = toCancel;
    return this;
  }

  connectCondition<TConditionName extends TConditions>(
    conditionName: TConditionName &
      NotExtends<TConnectedConditions, TConditionName> &
      string,
    builder: (to: ConditionFlowBuilder<TTasks>) => ConditionFlowBuilder<TTasks>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks,
    TConnectedConditions | TConditionName,
    TMetadata,
    TElementTypes
  > {
    this.definition.flows.conditions[conditionName] = builder(
      new ConditionFlowBuilder(conditionName)
    );
    return this;
  }

  connectTask<
    TTaskName extends TTasksWithOrXorSplit,
    THasDefault,
    TOrXorTaskFlowR,
    TOrXorTaskFlowE
  >(
    taskName: TTaskName & NotExtends<TConnectedTasks, TTaskName> & string,
    builder: (
      to: OrXorTaskFlowBuilder<
        TConditions,
        TTasks,
        never,
        never,
        never,
        TContext
      >
    ) => ValidOrXorTaskFlow<
      OrXorTaskFlowBuilder<
        TConditions,
        TTasks,
        TOrXorTaskFlowR,
        TOrXorTaskFlowE,
        THasDefault,
        TContext
      >
    >
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | TOrXorTaskFlowR,
    E | TOrXorTaskFlowE,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks | TTaskName,
    TConnectedConditions,
    TMetadata,
    TElementTypes
  >;

  connectTask<TTaskName extends TTasks>(
    taskName: TTaskName & NotExtends<TConnectedTasks, TTaskName> & string,
    builder: (
      to: TaskFlowBuilder<TConditions, TTasks>
    ) => TaskFlowBuilder<TConditions, TTasks>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R,
    E,
    TTasks,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit,
    TConnectedTasks | TTaskName,
    TConnectedConditions,
    TMetadata,
    TElementTypes
  >;

  connectTask(taskName: string, builder: (...any: any[]) => any) {
    if (
      this.definition.tasks[taskName]?.splitType === 'or' ||
      this.definition.tasks[taskName]?.splitType === 'xor'
    ) {
      const flow = new OrXorTaskFlowBuilder<TConditions, TTasks, never, never>(
        taskName
      );
      const result: OrXorTaskFlowBuilder<
        TConditions,
        TTasks,
        unknown,
        unknown,
        true,
        TContext
      > = builder(flow);
      this.definition.flows.tasks[taskName] = result;
    } else {
      const flow = new TaskFlowBuilder<TConditions, TTasks>(taskName);
      const result: TaskFlowBuilder<TConditions, TTasks> = builder(flow);
      this.definition.flows.tasks[taskName] = result;
    }
    return this;
  }

  build() {
    const { name, definition, activities } = this;

    return Effect.gen(function* () {
      const workflow = new Workflow<R, E, TContext, TMetadata, TElementTypes>(
        name,
        activities as unknown as WorkflowActivities<any>
      );

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
      return new WorkflowBuilder<N, UnknownAsUndefined<C>, never, never>(
        name
      ).initialize();
    },
  };
}
