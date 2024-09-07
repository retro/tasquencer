import { Effect } from 'effect';
import { Get, Simplify } from 'type-fest';

import { CompositeTask } from '../elements/CompositeTask.js';
import { Workflow } from '../elements/Workflow.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
} from '../errors.js';
import {
  CompositeTaskActivities,
  CompositeTaskOnStartPayload,
  ConditionInstance,
  ElementTypes,
  JoinType,
  ShouldCompositeTaskCompleteFn,
  ShouldCompositeTaskFailFn,
  SplitType,
  TaskInstance,
  TaskOnCancelPayload,
  TaskOnCompletePayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnFailPayload,
  TaskOnStartSym,
  WorkItemInstance,
  WorkflowInstance,
  activeWorkflowInstanceStates,
} from '../types.js';
import {
  AnyWorkflowBuilder,
  AnyWorkflowBuilderWithCorrectParentContext,
  WorkflowBuilderContext,
  WorkflowBuilderE,
  WorkflowBuilderElementTypes,
  WorkflowBuilderMetadata,
  WorkflowBuilderR,
} from './WorkflowBuilder.js';

export type CompositeTaskBuilderContext<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    infer TContext,
    any,
    any,
    any,
    any
  >
    ? TContext
    : never;

export type CompositeTaskBuilderSplitType<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    infer TSplitType,
    any,
    any,
    any,
    any,
    any
  >
    ? TSplitType
    : never;

export type CompositeTaskBuilderActivitiesReturnType<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    infer TActivitiesReturnType
  >
    ? TActivitiesReturnType
    : never;

export type CompositeTaskBuilderR<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer R
  >
    ? R
    : never;

export type CompositeTaskBuilderE<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer E
  >
    ? E
    : never;

export type AnyCompositeTaskBuilder<TContext = unknown> = CompositeTaskBuilder<
  TContext,
  any,
  CompositeTaskActivities<TContext>,
  JoinType | undefined,
  SplitType | undefined
>;

export type InitializedCompositeTaskBuilder<TContext> = CompositeTaskBuilder<
  TContext,
  object,
  CompositeTaskActivities<TContext>,
  undefined,
  undefined
>;

type CompositeTaskBuilderCompositeTaskMetadata<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    infer CompositeTaskMetadata,
    any
  >
    ? CompositeTaskMetadata
    : never;

type CompositeTaskBuilderWorkItemMetadata<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    infer WIM
  >
    ? WIM
    : never;

export type CompositeTaskBuilderMetadata<
  TCompositeTaskBuilder extends CompositeTaskBuilder<
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
> = Simplify<
  CompositeTaskBuilderCompositeTaskMetadata<TCompositeTaskBuilder> &
    Record<string, CompositeTaskBuilderWorkItemMetadata<TCompositeTaskBuilder>>
>;

interface CompositeTaskActivityMetadata<TInput, TReturn> {
  input: TInput;
  return: TReturn;
}

export type CompositeTaskElementTypes<TCompositeTaskBuilder> =
  TCompositeTaskBuilder extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer TElementTypes,
    any,
    any
  >
    ? TElementTypes
    : never;

export class CompositeTaskBuilder<
  TContext,
  TChildWorkflowContext,
  TCompositeTaskActivities extends CompositeTaskActivities<TContext>,
  TJoinType extends JoinType | undefined,
  TSplitType extends SplitType | undefined,
  TCompositeTaskMetadata = object,
  TWorkItemMetadata = never,
  TElementTypes extends ElementTypes = {
    workflow: WorkflowInstance;
    workItem: WorkItemInstance;
    condition: ConditionInstance;
    task: TaskInstance;
  },
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private activities: TCompositeTaskActivities = {} as TCompositeTaskActivities;
  private workflowBuilder: AnyWorkflowBuilder;
  private shouldComplete: ShouldCompositeTaskCompleteFn<any, any> = ({
    workflows,
  }) => {
    const hasActiveWorkflows = workflows.some((w) =>
      activeWorkflowInstanceStates.has(w.state)
    );
    const hasCompletedWorkflows = workflows.some(
      (w) => w.state === 'completed'
    );
    return Effect.succeed(
      workflows.length > 0 && !hasActiveWorkflows && hasCompletedWorkflows
    );
  };
  private shouldFail: ShouldCompositeTaskFailFn<any, any> = ({ workflows }) => {
    const hasFailedItems = workflows.some((w) => w.state === 'failed');
    return Effect.succeed(hasFailedItems);
  };

  constructor(workflowBuilder: AnyWorkflowBuilder) {
    this.workflowBuilder = workflowBuilder;
  }

  withJoinType<TNewJoinType extends JoinType | undefined>(
    joinType: TNewJoinType
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TNewJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R,
    E
  > {
    this.joinType = joinType;
    return this;
  }

  withSplitType<TNewSplitType extends SplitType | undefined>(
    splitType: TNewSplitType
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TNewSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R,
    E
  > {
    this.splitType = splitType;
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.void)
      .onEnable(() => Effect.void)
      .onStart((_, input) => Effect.succeed(input))
      .onComplete(() => Effect.void)
      .onCancel(() => Effect.void)
      .onFail(() => Effect.void);
  }

  onDisable<
    TOnDisableActivity extends (
      payload: TaskOnDisablePayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnDisableActivity
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TOnDisableActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnDisableActivity>>
  > {
    this.activities.onDisable = f;
    return this;
  }

  onEnable<
    TOnEnableActivity extends (
      payload: TaskOnEnablePayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnEnableActivity
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TOnEnableActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnEnableActivity>>
  > {
    this.activities.onEnable = f;
    return this;
  }

  onStart<
    TOnStartActivityInput,
    TOnStartActivity extends (
      payload: CompositeTaskOnStartPayload<
        TContext,
        TChildWorkflowContext,
        Get<TWorkItemMetadata, ['onStart', 'input']>
      >,
      input: TOnStartActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnStartActivity
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    Simplify<
      Omit<TCompositeTaskMetadata, TaskOnStartSym> & {
        [TaskOnStartSym]: CompositeTaskActivityMetadata<
          Parameters<TOnStartActivity>[1],
          Effect.Effect.Success<ReturnType<TOnStartActivity>>
        >;
      }
    >,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TOnStartActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnStartActivity>>
  > {
    this.activities.onStart = f;
    return this;
  }

  onComplete<
    TOnCompleteActivity extends (
      payload: TaskOnCompletePayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCompleteActivity
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TOnCompleteActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCompleteActivity>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    TOnCancelActivity extends (
      payload: TaskOnCancelPayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCancelActivity
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TOnCancelActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCancelActivity>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  onFail<
    TOnFailActivity extends (
      payload: TaskOnFailPayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnFailActivity
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TOnFailActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnFailActivity>>
  > {
    this.activities.onFail = f;
    return this;
  }

  withShouldComplete<
    TShouldComplete extends ShouldCompositeTaskCompleteFn<
      TContext,
      TChildWorkflowContext
    >
  >(
    f: TShouldComplete
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TShouldComplete>>,
    E | Effect.Effect.Error<ReturnType<TShouldComplete>>
  > {
    this.shouldComplete = f;
    return this;
  }

  withShouldFail<
    TShouldFail extends ShouldCompositeTaskFailFn<
      TContext,
      TChildWorkflowContext
    >
  >(
    f: TShouldFail
  ): CompositeTaskBuilder<
    TContext,
    TChildWorkflowContext,
    TCompositeTaskActivities,
    TJoinType,
    TSplitType,
    TCompositeTaskMetadata,
    TWorkItemMetadata,
    TElementTypes,
    R | Effect.Effect.Context<ReturnType<TShouldFail>>,
    E | Effect.Effect.Error<ReturnType<TShouldFail>>
  > {
    this.shouldFail = f;
    return this;
  }

  build(
    workflow: Workflow,
    name: string
  ): Effect.Effect<
    void,
    | StartConditionDoesNotExist
    | EndConditionDoesNotExist
    | ConditionDoesNotExist
    | TaskDoesNotExist
  > {
    const {
      splitType,
      joinType,
      activities,
      workflowBuilder,
      shouldComplete,
      shouldFail,
    } = this;
    return Effect.gen(function* () {
      const subWorkflow = yield* workflowBuilder.build();
      const compositeTask = new CompositeTask(
        name,
        workflow,
        subWorkflow,
        activities as unknown as CompositeTaskActivities<TContext>,
        shouldComplete as ShouldCompositeTaskCompleteFn<any, any, never, never>,
        shouldFail as ShouldCompositeTaskFailFn<any, any, never, never>,
        { joinType, splitType }
      );
      subWorkflow.setParentTask(compositeTask);
      workflow.addTask(compositeTask);
    });
  }
}

export interface InitialCompositeTaskFnReturnType<TContext> {
  withSubWorkflow: <TWorkflowBuilder extends AnyWorkflowBuilder>(
    workflow: TWorkflowBuilder &
      AnyWorkflowBuilderWithCorrectParentContext<TWorkflowBuilder, TContext>
  ) => CompositeTaskBuilder<
    TContext,
    WorkflowBuilderContext<TWorkflowBuilder>,
    any,
    undefined,
    undefined,
    object,
    WorkflowBuilderMetadata<TWorkflowBuilder>,
    WorkflowBuilderElementTypes<TWorkflowBuilder>,
    WorkflowBuilderR<TWorkflowBuilder>,
    WorkflowBuilderE<TWorkflowBuilder>
  >;
}

export function compositeTask<TContext>() {
  return {
    withSubWorkflow<TWorkflowBuilder extends AnyWorkflowBuilder>(
      workflow: TWorkflowBuilder &
        AnyWorkflowBuilderWithCorrectParentContext<TWorkflowBuilder, TContext>
    ) {
      return new CompositeTaskBuilder<
        TContext,
        WorkflowBuilderContext<TWorkflowBuilder>,
        CompositeTaskActivities<TContext>,
        undefined,
        undefined,
        object,
        WorkflowBuilderMetadata<TWorkflowBuilder>,
        WorkflowBuilderElementTypes<TWorkflowBuilder>,
        WorkflowBuilderR<TWorkflowBuilder>,
        WorkflowBuilderE<TWorkflowBuilder>
      >(workflow).initialize();
    },
  };
}
