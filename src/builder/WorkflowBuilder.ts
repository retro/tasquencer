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

type TaskWithValidContext<TContext, TTaskBuilder> =
  TContext extends TB.TaskBuilderContext<TTaskBuilder> ? TTaskBuilder : never;

type CompositeTaskWithValidContext<TContext, TCompositeTaskBuilder> =
  TContext extends CTB.CompositeTaskBuilderContext<TCompositeTaskBuilder>
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

export type WorkflowBuilderContext<TWorkflowBuilder> =
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

export type WorkflowBuilderR<TWorkflowBuilder> =
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

export type WorkflowBuilderE<TWorkflowBuilder> =
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

export type WorkflowBuilderTaskActivitiesReturnType<TWorkflowBuilder> =
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
    infer TTaskActivitiesReturnType,
    any
  >
    ? TTaskActivitiesReturnType
    : never;

export type WorkflowBuilderMetadata<TWorkflowBuilder> =
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

export type WorkflowBuilderElementTypes<TWorkflowBuilder> =
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

export type WorkflowBuilderTaskNames<TWorkflowBuilder> =
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
  TMetadata = { [WorkflowContextSym]: TContext },
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
    Simplify<
      Omit<TMetadata, 'onStart'> & {
        onStart: WorkflowActivityMetadata<
          Parameters<TOnStartActivity>[1],
          Effect.Effect.Success<ReturnType<TOnStartActivity>>
        >;
      }
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
    Simplify<
      Omit<TMetadata, 'onComplete'> & {
        onComplete: WorkflowActivityMetadata<
          Parameters<TOnCompleteActivity>[1],
          Effect.Effect.Success<ReturnType<TOnCompleteActivity>>
        >;
      }
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
      input?: TOnFailActivityInput
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
    Simplify<
      Omit<TMetadata, 'onFail'> & {
        onFail: WorkflowActivityMetadata<
          Parameters<TOnFailActivity>[1],
          Effect.Effect.Success<ReturnType<TOnFailActivity>>
        >;
      }
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
      input?: TOnCancelActivityInput
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
    Simplify<
      Omit<TMetadata, 'onCancel'> & {
        onCancel: WorkflowActivityMetadata<
          Parameters<TOnCancelActivity>[1],
          Effect.Effect.Success<ReturnType<TOnCancelActivity>>
        >;
      }
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
      TB.TaskBuilderSplitType<TTaskBuilder>
    > extends never
      ? never
      : TTaskName
  >(
    taskName: TTaskName & NotExtends<TTasks | TConditions, TTaskName>,
    task: TTaskBuilder & TaskWithValidContext<TContext, TTaskBuilder>
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | TB.TaskBuilderR<TTaskBuilder>,
    E | TB.TaskBuilderE<TTaskBuilder>,
    TTasks | TTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | TIsXorOrOrJoinSplit,
    TConnectedTasks,
    TConnectedConditions,
    Simplify<
      TMetadata & {
        [tn in TTaskName]: TB.TaskBuilderMetadata<TTaskBuilder>;
      }
    >,
    {
      workflow: TElementTypes['workflow'];
      workItem:
        | TElementTypes['workItem']
        | WorkItemInstance<
            TB.TaskBuilderWorkItemPayload<TTaskBuilder>,
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
      TB.TaskBuilderSplitType<ReturnType<TTaskBuilderInit>>
    > extends never
      ? never
      : TTaskName
  >(
    taskName: TTaskName & NotExtends<TTasks | TConditions, TTaskName>,
    task: TTaskBuilderInit
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | TB.TaskBuilderR<ReturnType<TTaskBuilderInit>>,
    E | TB.TaskBuilderE<ReturnType<TTaskBuilderInit>>,
    TTasks | TTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | X,
    TConnectedTasks,
    TConnectedConditions,
    Simplify<
      TMetadata & {
        [tn in TTaskName]: TB.TaskBuilderMetadata<ReturnType<TTaskBuilderInit>>;
      }
    >,
    {
      workflow: TElementTypes['workflow'];
      workItem:
        | TElementTypes['workItem']
        | WorkItemInstance<
            TB.TaskBuilderWorkItemPayload<ReturnType<TTaskBuilderInit>>,
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
    Simplify<
      TMetadata & {
        [tn in TTaskName]: TB.TaskBuilderMetadata<TB.AnyTaskBuilder>;
      }
    >,
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
      CTB.CompositeTaskBuilderSplitType<TCompositeTaskBuilder>
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
    R | CTB.CompositeTaskBuilderR<TCompositeTaskBuilder>,
    E | CTB.CompositeTaskBuilderE<TCompositeTaskBuilder>,
    TTasks | TCompositeTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | TIsXorOrOrJoinSplit,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      [tn in TCompositeTaskName]: CTB.CompositeTaskBuilderMetadata<TCompositeTaskBuilder>;
    },
    {
      workflow:
        | TElementTypes['workflow']
        | CTB.CompositeTaskElementTypes<TCompositeTaskBuilder>['workflow'];
      workItem:
        | TElementTypes['workItem']
        | CTB.CompositeTaskElementTypes<TCompositeTaskBuilder>['workItem'];
      condition:
        | TElementTypes['condition']
        | CTB.CompositeTaskElementTypes<TCompositeTaskBuilder>['condition'];
      task:
        | TElementTypes['task']
        | {
            name: TCompositeTaskName & TaskName;
            workflowName: TWorkflowName;
            workflowId: WorkflowId;
            generation: number;
            state: TaskInstanceState;
          }
        | CTB.CompositeTaskElementTypes<TCompositeTaskBuilder>['task'];
    }
  >;
  compositeTask<
    TCompositeTaskName extends string,
    TCompositeTaskInit extends (
      t: () => CTB.InitialCompositeTaskFnReturnType<TContext>
    ) => CTB.AnyCompositeTaskBuilder<TContext, any>,
    X extends IsXorOrOrJoinSplit<
      CTB.CompositeTaskBuilderSplitType<ReturnType<TCompositeTaskInit>>
    > extends never
      ? never
      : TCompositeTaskName
  >(
    compositeTaskName: TCompositeTaskName &
      NotExtends<TTasks | TConditions, TCompositeTaskName>,
    compositeTask: TCompositeTaskInit
  ): WorkflowBuilder<
    TWorkflowName,
    TContext,
    R | CTB.CompositeTaskBuilderR<ReturnType<TCompositeTaskInit>>,
    E | CTB.CompositeTaskBuilderE<ReturnType<TCompositeTaskInit>>,
    TTasks | TCompositeTaskName,
    TConditions,
    TCancellationRegions,
    TTasksWithOrXorSplit | X,
    TConnectedTasks,
    TConnectedConditions,
    TMetadata & {
      [tn in TCompositeTaskName]: CTB.CompositeTaskBuilderMetadata<
        ReturnType<TCompositeTaskInit>
      >;
    },
    {
      workflow:
        | TElementTypes['workflow']
        | CTB.CompositeTaskElementTypes<
            ReturnType<TCompositeTaskInit>
          >['workflow'];
      workItem:
        | TElementTypes['workItem']
        | CTB.CompositeTaskElementTypes<
            ReturnType<TCompositeTaskInit>
          >['workItem'];
      condition:
        | TElementTypes['condition']
        | CTB.CompositeTaskElementTypes<
            ReturnType<TCompositeTaskInit>
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
        | CTB.CompositeTaskElementTypes<ReturnType<TCompositeTaskInit>>['task'];
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
      return new WorkflowBuilder<N, C, never, never>(name).initialize();
    },
  };
}
