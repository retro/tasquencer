import { Effect } from 'effect';
import { describe, expectTypeOf, it } from 'vitest';

import {
  GetCompositeTaskBuilderCompositeTaskMetadata,
  GetCompositeTaskBuilderWorkflowMetadata,
} from '../builder/CompositeTaskBuilder.js';
import {
  GetTaskBuilderTaskMetadata,
  GetTaskBuilderWorkItemMetadata,
} from '../builder/TaskBuilder.js';
import { GetWorkItemBuilderWorkItemMetadata } from '../builder/WorkItemBuilder.js';
import { GetWorkflowBuilderMetadata } from '../builder/WorkflowBuilder.js';
import {
  Builder,
  WorkflowBuilderMetadataCompositeTaskPayloads,
  WorkflowBuilderMetadataTaskPayloads,
  WorkflowBuilderMetadataWorkItemPayloads,
  WorkflowBuilderMetadataWorkflowPayloads,
} from '../index.js';

type WorkItemPayload = { workItemPayload: boolean };
type WorkflowContext = { workflowContext: boolean };
type ChildWorkflowContext = { childWorkflowContext: boolean };
type GrandChildWorkflowContext = { grandChildWorkflowContext: boolean };

describe('work item metadata', () => {
  it('can correctly infer the metadata type when using the explicit builder (all types set)', () => {
    const workItem = Builder.workItem<WorkItemPayload>()
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('ON COMPLETE' as const)
      )
      .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type WorkItemMetadata = GetWorkItemBuilderWorkItemMetadata<typeof workItem>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: WorkItemPayload;
      onComplete: {
        input: {
          onCompleteInput: boolean;
        };
        payload: WorkItemPayload;
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: undefined;
        payload: WorkItemPayload;
        return: 'ON CANCEL';
      };
      onFail: {
        input: {
          onFailInput: boolean;
        };
        payload: WorkItemPayload;
        return: 'ON FAIL';
      };
      onStart: {
        input: {
          onStartInput: boolean;
        };
        payload: WorkItemPayload;
        return: 'ON START';
      };
    }>();
  });

  it('can correctly infer the metadata type when using the explicit builder (no types set)', () => {
    const workItem = Builder.workItem()
      .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
      .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
      .onFail((_props) => Effect.succeed('ON FAIL' as const))
      .onStart((_props) => Effect.succeed('ON START' as const));

    type WorkItemMetadata = GetWorkItemBuilderWorkItemMetadata<typeof workItem>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: undefined;
      onComplete: {
        input: undefined;
        payload: undefined;
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: undefined;
        payload: undefined;
        return: 'ON CANCEL';
      };
      onFail: {
        input: undefined;
        payload: undefined;
        return: 'ON FAIL';
      };
      onStart: {
        input: undefined;
        payload: undefined;
        return: 'ON START';
      };
    }>();
  });

  it('can correctly infer the metadata type when using the explicit builder (no builder methods called)', () => {
    const workItem = Builder.workItem();

    type WorkItemMetadata = GetWorkItemBuilderWorkItemMetadata<typeof workItem>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: undefined;
      onComplete: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onCancel: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onFail: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onStart: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
    }>();
  });

  it('can correctly infer the metadata type when using the implicit task builder (all types set)', () => {
    const task = Builder.task().withWorkItem((w) =>
      w<WorkItemPayload>()
        .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
          Effect.succeed('ON COMPLETE' as const)
        )
        .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
        .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
          Effect.succeed('ON FAIL' as const)
        )
        .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
          Effect.succeed('ON START' as const)
        )
    );

    type WorkItemMetadata = GetTaskBuilderWorkItemMetadata<typeof task>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: WorkItemPayload;
      onComplete: {
        input: {
          onCompleteInput: boolean;
        };
        payload: WorkItemPayload;
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: undefined;
        payload: WorkItemPayload;
        return: 'ON CANCEL';
      };
      onFail: {
        input: {
          onFailInput: boolean;
        };
        payload: WorkItemPayload;
        return: 'ON FAIL';
      };
      onStart: {
        input: {
          onStartInput: boolean;
        };
        payload: WorkItemPayload;
        return: 'ON START';
      };
    }>();
  });

  it('can correctly infer the metadata type when using the implicit task builder (no types set)', () => {
    const task = Builder.task().withWorkItem((w) =>
      w()
        .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
        .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
        .onFail((_props) => Effect.succeed('ON FAIL' as const))
        .onStart((_props) => Effect.succeed('ON START' as const))
    );

    type WorkItemMetadata = GetTaskBuilderWorkItemMetadata<typeof task>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: undefined;
      onComplete: {
        input: undefined;
        payload: undefined;
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: undefined;
        payload: undefined;
        return: 'ON CANCEL';
      };
      onFail: {
        input: undefined;
        payload: undefined;
        return: 'ON FAIL';
      };
      onStart: {
        input: undefined;
        payload: undefined;
        return: 'ON START';
      };
    }>();
  });

  it('can correctly infer the metadata type when using the implicit task builder (no builder methods called)', () => {
    const task = Builder.task().withWorkItem((w) => w());

    type WorkItemMetadata = GetTaskBuilderWorkItemMetadata<typeof task>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: undefined;
      onComplete: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onCancel: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onFail: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onStart: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
    }>();
  });

  it('can correctly infer the metadata type when using the implicit task builder (without calling withWorkItem)', () => {
    const task = Builder.task();

    type WorkItemMetadata = GetTaskBuilderWorkItemMetadata<typeof task>;

    expectTypeOf<WorkItemMetadata>().toEqualTypeOf<{
      payload: undefined;
      onComplete: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onCancel: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onFail: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
      onStart: {
        input: undefined;
        payload: undefined;
        return: undefined;
      };
    }>();
  });
});

describe('task metadata', () => {
  it('can correctly infer the metadata type when using the explicit builder (all types set)', () => {
    const task = Builder.task()
      .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
      .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
      .onFail((_props) => Effect.succeed('ON FAIL' as const))
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type TaskMetadata = GetTaskBuilderTaskMetadata<typeof task>;

    expectTypeOf<TaskMetadata>().toEqualTypeOf<{
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
    }>();
  });

  it('can correctly infer the metadata type when using the explicit builder (no types set)', () => {
    const task = Builder.task()
      .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
      .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
      .onFail((_props) => Effect.succeed('ON FAIL' as const))
      .onStart((_props) => Effect.succeed('ON START' as const));

    type TaskMetadata = GetTaskBuilderTaskMetadata<typeof task>;

    expectTypeOf<TaskMetadata>().toEqualTypeOf<{
      onStart: {
        input: undefined;
        return: 'ON START';
      };
    }>();
  });

  it('can correctly infer the metadata type when using the explicit builder (no builder methods called)', () => {
    const task = Builder.task();
    type TaskMetadata = GetTaskBuilderTaskMetadata<typeof task>;

    expectTypeOf<TaskMetadata>().toEqualTypeOf<{
      onStart: {
        input: undefined;
        return: undefined;
      };
    }>();
  });
});

describe('composite task metadata', () => {
  const childWorkflow = Builder.workflow<ChildWorkflowContext>()
    .withName('child')
    .startCondition('start')
    .task('t', (t) =>
      t()
        .withWorkItem((w) =>
          w<WorkItemPayload>()
            .onComplete(
              (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                Effect.succeed('ON COMPLETE' as const)
            )
            .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
            .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
              Effect.succeed('ON FAIL' as const)
            )
            .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
              Effect.succeed('ON START' as const)
            )
        )

        .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
        .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
        .onFail((_props) => Effect.succeed('ON FAIL' as const))
        .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
          Effect.succeed('ON START' as const)
        )
    )
    .task('t1')
    .endCondition('end')
    .connectCondition('start', (to) => to.task('t'))
    .connectTask('t', (to) => to.condition('end'))
    .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
      Effect.succeed('ON COMPLETE' as const)
    )
    .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
      Effect.succeed('ON CANCEL' as const)
    )
    .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
      Effect.succeed('ON FAIL' as const)
    )
    .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
      Effect.succeed('ON START' as const)
    );

  const compositeTask = Builder.compositeTask<WorkflowContext>()
    .withSubWorkflow(childWorkflow)
    .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
    .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
    .onFail((_props) => Effect.succeed('ON FAIL' as const))
    .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
      Effect.succeed('ON START' as const)
    );

  type CompositeTaskMetadata = GetCompositeTaskBuilderCompositeTaskMetadata<
    typeof compositeTask
  >;

  type CompositeTaskWorkflowMetadata = GetCompositeTaskBuilderWorkflowMetadata<
    typeof compositeTask
  >;

  it('can correctly infer the metadata type ', () => {
    expectTypeOf<CompositeTaskMetadata>().toEqualTypeOf<{
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
    }>();
  });

  it("can correctly infer composite task's workflow metadata", () => {
    expectTypeOf<CompositeTaskWorkflowMetadata>().toMatchTypeOf<{
      name: 'child';
      context: ChildWorkflowContext;
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
      onComplete: {
        input: { onCompleteInput: boolean };
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: { onCancelInput: boolean };
        return: 'ON CANCEL';
      };
      onFail: {
        input: { onFailInput: boolean };
        return: 'ON FAIL';
      };
      tasks: {
        t: {
          type: 'task';
          name: 't';
          metadata: {
            _tag: 't';
            onStart: { input: { onStartInput: boolean }; return: 'ON START' };
          };
          workItemMetadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON COMPLETE';
            };
            onCancel: {
              input: undefined;
              payload: { workItemPayload: boolean };
              return: 'ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON FAIL';
            };
          };
        };
        t1: {
          type: 'task';
          name: 't1';
          metadata: {
            _tag: 't1';
            onStart: {
              input: undefined;
              return: undefined;
            };
          };
          workItemMetadata: {
            _tag: 't1';
            onStart: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
            onComplete: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
            onCancel: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
            onFail: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
          };
        };
      };
      compositeTasks: Record<never, never>;
    }>();
  });
});

describe('workflow metadata', () => {
  it('can correctly infer the metadata type with all types set (implicit builders)', () => {
    const workflow = Builder.workflow<WorkflowContext>()
      .withName('test')
      .startCondition('start')
      .task('t', (t) =>
        t()
          .withWorkItem((w) =>
            w<WorkItemPayload>()
              .onComplete(
                (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                  Effect.succeed('ON COMPLETE' as const)
              )
              .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
              .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
                Effect.succeed('ON FAIL' as const)
              )
              .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
                Effect.succeed('ON START' as const)
              )
          )

          .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
          .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
          .onFail((_props) => Effect.succeed('ON FAIL' as const))
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('ON START' as const)
          )
      )
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type TestWorkflowMetadata = GetWorkflowBuilderMetadata<typeof workflow>;

    expectTypeOf<TestWorkflowMetadata>().toMatchTypeOf<{
      name: 'test';
      context: WorkflowContext;
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
      onComplete: {
        input: { onCompleteInput: boolean };
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: { onCancelInput: boolean };
        return: 'ON CANCEL';
      };
      onFail: {
        input: { onFailInput: boolean };
        return: 'ON FAIL';
      };
      tasks: {
        t: {
          type: 'task';
          name: 't';
          metadata: {
            _tag: 't';
            onStart: { input: { onStartInput: boolean }; return: 'ON START' };
          };
          workItemMetadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON COMPLETE';
            };
            onCancel: {
              input: undefined;
              payload: { workItemPayload: boolean };
              return: 'ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON FAIL';
            };
          };
        };
      };
      compositeTasks: Record<never, never>;
    }>();
  });

  it('can correctly infer the metadata type with all types set (implicit builders)', () => {
    const tTask = Builder.task<WorkflowContext>()
      .withWorkItem((w) =>
        w<WorkItemPayload>()
          .onComplete(
            (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
              Effect.succeed('ON COMPLETE' as const)
          )
          .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
          .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
            Effect.succeed('ON FAIL' as const)
          )
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('ON START' as const)
          )
      )

      .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
      .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
      .onFail((_props) => Effect.succeed('ON FAIL' as const))
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    const workflow = Builder.workflow<WorkflowContext>()
      .withName('test')
      .startCondition('start')
      .task('t', tTask)
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type TestWorkflowMetadata = GetWorkflowBuilderMetadata<typeof workflow>;

    expectTypeOf<TestWorkflowMetadata>().toMatchTypeOf<{
      name: 'test';
      context: WorkflowContext;
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
      onComplete: {
        input: { onCompleteInput: boolean };
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: { onCancelInput: boolean };
        return: 'ON CANCEL';
      };
      onFail: {
        input: { onFailInput: boolean };
        return: 'ON FAIL';
      };
      tasks: {
        t: {
          type: 'task';
          name: 't';
          metadata: {
            _tag: 't';
            onStart: { input: { onStartInput: boolean }; return: 'ON START' };
          };
          workItemMetadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON COMPLETE';
            };
            onCancel: {
              input: undefined;
              payload: { workItemPayload: boolean };
              return: 'ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON FAIL';
            };
          };
        };
      };
      compositeTasks: Record<never, never>;
    }>();
  });

  it('can correctly infer the metadata type when no task builder is used', () => {
    const workflow = Builder.workflow<WorkflowContext>()
      .withName('test')
      .startCondition('start')
      .task('t')
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type TestWorkflowMetadata = GetWorkflowBuilderMetadata<typeof workflow>;

    expectTypeOf<TestWorkflowMetadata>().toMatchTypeOf<{
      name: 'test';
      context: WorkflowContext;
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
      onComplete: {
        input: { onCompleteInput: boolean };
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: { onCancelInput: boolean };
        return: 'ON CANCEL';
      };
      onFail: {
        input: { onFailInput: boolean };
        return: 'ON FAIL';
      };
      tasks: {
        t: {
          type: 'task';
          name: 't';
          metadata: {
            _tag: 't';
            onStart: { input: undefined; return: undefined };
          };
          workItemMetadata: {
            _tag: 't';
            onStart: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
            onComplete: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
            onCancel: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
            onFail: {
              input: undefined;
              payload: undefined;
              return: undefined;
            };
          };
        };
      };
      compositeTasks: Record<never, never>;
    }>();
  });
});

describe('nested workflow metadata', () => {
  it('can correctly infer the metadata type when using the implicit composite task builder', () => {
    const childWorkflow = Builder.workflow<ChildWorkflowContext>()
      .withName('child')
      .startCondition('start')
      .task('t', (t) =>
        t()
          .withWorkItem((w) =>
            w<WorkItemPayload>()
              .onComplete(
                (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                  Effect.succeed('CHILD WORK ITEM ON COMPLETE' as const)
              )
              .onCancel((_props) =>
                Effect.succeed('CHILD WORK ITEM ON CANCEL' as const)
              )
              .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
                Effect.succeed('CHILD WORK ITEM ON FAIL' as const)
              )
              .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
                Effect.succeed('CHILD WORK ITEM ON START' as const)
              )
          )

          .onComplete((_props) =>
            Effect.succeed('CHILD TASK ON COMPLETE' as const)
          )
          .onCancel((_props) => Effect.succeed('CHILD TASK ON CANCEL' as const))
          .onFail((_props) => Effect.succeed('CHILD TASK ON FAIL' as const))
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('CHILD TASK ON START' as const)
          )
      )
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON START' as const)
      );

    const workflow = Builder.workflow<WorkflowContext>()
      .withName('test')
      .startCondition('start')
      .task('t', (t) =>
        t()
          .withWorkItem((w) =>
            w<WorkItemPayload>()
              .onComplete(
                (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                  Effect.succeed('ON COMPLETE' as const)
              )
              .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
              .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
                Effect.succeed('ON FAIL' as const)
              )
              .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
                Effect.succeed('ON START' as const)
              )
          )

          .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
          .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
          .onFail((_props) => Effect.succeed('ON FAIL' as const))
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('ON START' as const)
          )
      )
      .compositeTask('ct', (ct) =>
        ct()
          .withSubWorkflow(childWorkflow)
          .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
          .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
          .onFail((_props) => Effect.succeed('ON FAIL' as const))
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('ON START' as const)
          )
      )
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.task('ct'))
      .connectTask('ct', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type TestWorkflowMetadata = GetWorkflowBuilderMetadata<typeof workflow>;

    expectTypeOf<TestWorkflowMetadata>().toMatchTypeOf<{
      name: 'test';
      context: WorkflowContext;
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
      onComplete: {
        input: { onCompleteInput: boolean };
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: { onCancelInput: boolean };
        return: 'ON CANCEL';
      };
      onFail: {
        input: { onFailInput: boolean };
        return: 'ON FAIL';
      };
      tasks: {
        t: {
          type: 'task';
          name: 't';
          metadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              return: 'ON START';
            };
          };
          workItemMetadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON COMPLETE';
            };
            onCancel: {
              input: undefined;
              payload: { workItemPayload: boolean };
              return: 'ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON FAIL';
            };
          };
        };
      };
      compositeTasks: {
        ct: {
          type: 'compositeTask';
          name: 'ct';
          metadata: {
            _tag: 'ct';
            onStart: {
              input: { onStartInput: boolean };
              return: 'ON START';
            };
          };
          workflowMetadata: {
            name: 'child';
            context: { childWorkflowContext: boolean };
            onStart: {
              input: { onStartInput: boolean };
              return: 'CHILD WORKFLOW ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              return: 'CHILD WORKFLOW ON COMPLETE';
            };
            onCancel: {
              input: { onCancelInput: boolean };
              return: 'CHILD WORKFLOW ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              return: 'CHILD WORKFLOW ON FAIL';
            };
            tasks: {
              t: {
                type: 'task';
                name: 't';
                metadata: {
                  _tag: 't';
                  onStart: {
                    input: { onStartInput: boolean };
                    return: 'CHILD TASK ON START';
                  };
                };
                workItemMetadata: {
                  _tag: 't';
                  onStart: {
                    input: { onStartInput: boolean };
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON START';
                  };
                  onComplete: {
                    input: { onCompleteInput: boolean };
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON COMPLETE';
                  };
                  onCancel: {
                    input: undefined;
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON CANCEL';
                  };
                  onFail: {
                    input: { onFailInput: boolean };
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON FAIL';
                  };
                };
              };
            };
          };
        };
      };
    }>();
  });

  it('can correctly infer the metadata type when using the explicit composite task builder', () => {
    const childWorkflow = Builder.workflow<ChildWorkflowContext>()
      .withName('child')
      .startCondition('start')
      .task('t', (t) =>
        t()
          .withWorkItem((w) =>
            w<WorkItemPayload>()
              .onComplete(
                (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                  Effect.succeed('CHILD WORK ITEM ON COMPLETE' as const)
              )
              .onCancel((_props) =>
                Effect.succeed('CHILD WORK ITEM ON CANCEL' as const)
              )
              .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
                Effect.succeed('CHILD WORK ITEM ON FAIL' as const)
              )
              .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
                Effect.succeed('CHILD WORK ITEM ON START' as const)
              )
          )

          .onComplete((_props) =>
            Effect.succeed('CHILD TASK ON COMPLETE' as const)
          )
          .onCancel((_props) => Effect.succeed('CHILD TASK ON CANCEL' as const))
          .onFail((_props) => Effect.succeed('CHILD TASK ON FAIL' as const))
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('CHILD TASK ON START' as const)
          )
      )
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('CHILD WORKFLOW ON START' as const)
      );

    const compositeTask = Builder.compositeTask<WorkflowContext>()
      .withSubWorkflow(childWorkflow)
      .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
      .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
      .onFail((_props) => Effect.succeed('ON FAIL' as const))
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    const workflow = Builder.workflow<WorkflowContext>()
      .withName('test')
      .startCondition('start')
      .task('t', (t) =>
        t()
          .withWorkItem((w) =>
            w<WorkItemPayload>()
              .onComplete(
                (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                  Effect.succeed('ON COMPLETE' as const)
              )
              .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
              .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
                Effect.succeed('ON FAIL' as const)
              )
              .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
                Effect.succeed('ON START' as const)
              )
          )

          .onComplete((_props) => Effect.succeed('ON COMPLETE' as const))
          .onCancel((_props) => Effect.succeed('ON CANCEL' as const))
          .onFail((_props) => Effect.succeed('ON FAIL' as const))
          .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
            Effect.succeed('ON START' as const)
          )
      )
      .compositeTask('ct', compositeTask)
      .endCondition('end')
      .connectCondition('start', (to) => to.task('t'))
      .connectTask('t', (to) => to.task('ct'))
      .connectTask('ct', (to) => to.condition('end'))
      .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
        Effect.succeed('ON COMPLETE' as const)
      )
      .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
        Effect.succeed('ON CANCEL' as const)
      )
      .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
        Effect.succeed('ON FAIL' as const)
      )
      .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
        Effect.succeed('ON START' as const)
      );

    type TestWorkflowMetadata = GetWorkflowBuilderMetadata<typeof workflow>;

    expectTypeOf<TestWorkflowMetadata>().toMatchTypeOf<{
      name: 'test';
      context: WorkflowContext;
      onStart: {
        input: { onStartInput: boolean };
        return: 'ON START';
      };
      onComplete: {
        input: { onCompleteInput: boolean };
        return: 'ON COMPLETE';
      };
      onCancel: {
        input: { onCancelInput: boolean };
        return: 'ON CANCEL';
      };
      onFail: {
        input: { onFailInput: boolean };
        return: 'ON FAIL';
      };
      tasks: {
        t: {
          type: 'task';
          name: 't';
          metadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              return: 'ON START';
            };
          };
          workItemMetadata: {
            _tag: 't';
            onStart: {
              input: { onStartInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON COMPLETE';
            };
            onCancel: {
              input: undefined;
              payload: { workItemPayload: boolean };
              return: 'ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              payload: { workItemPayload: boolean };
              return: 'ON FAIL';
            };
          };
        };
      };
      compositeTasks: {
        ct: {
          type: 'compositeTask';
          name: 'ct';
          metadata: {
            _tag: 'ct';
            onStart: {
              input: { onStartInput: boolean };
              return: 'ON START';
            };
          };
          workflowMetadata: {
            name: 'child';
            context: { childWorkflowContext: boolean };
            onStart: {
              input: { onStartInput: boolean };
              return: 'CHILD WORKFLOW ON START';
            };
            onComplete: {
              input: { onCompleteInput: boolean };
              return: 'CHILD WORKFLOW ON COMPLETE';
            };
            onCancel: {
              input: { onCancelInput: boolean };
              return: 'CHILD WORKFLOW ON CANCEL';
            };
            onFail: {
              input: { onFailInput: boolean };
              return: 'CHILD WORKFLOW ON FAIL';
            };
            tasks: {
              t: {
                type: 'task';
                name: 't';
                metadata: {
                  _tag: 't';
                  onStart: {
                    input: { onStartInput: boolean };
                    return: 'CHILD TASK ON START';
                  };
                };
                workItemMetadata: {
                  _tag: 't';
                  onStart: {
                    input: { onStartInput: boolean };
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON START';
                  };
                  onComplete: {
                    input: { onCompleteInput: boolean };
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON COMPLETE';
                  };
                  onCancel: {
                    input: undefined;
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON CANCEL';
                  };
                  onFail: {
                    input: { onFailInput: boolean };
                    payload: { workItemPayload: boolean };
                    return: 'CHILD WORK ITEM ON FAIL';
                  };
                };
              };
            };
          };
        };
      };
    }>();
  });
});

describe('helper types for public API', () => {
  const grandChildWorkflow = Builder.workflow<GrandChildWorkflowContext>()
    .withName('grandChild')
    .startCondition('start')
    .task('grandChildT', (t) =>
      t()
        .withWorkItem((w) =>
          w<WorkItemPayload>()
            .onComplete(
              (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                Effect.succeed('GRAND CHILD WORK ITEM ON COMPLETE' as const)
            )
            .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
              Effect.succeed('GRAND CHILD WORK ITEM ON CANCEL' as const)
            )
            .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
              Effect.succeed('GRAND CHILD WORK ITEM ON FAIL' as const)
            )
            .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
              Effect.succeed('GRAND CHILD WORK ITEM ON START' as const)
            )
        )

        .onComplete((_props) =>
          Effect.succeed('GRAND CHILD TASK ON COMPLETE' as const)
        )
        .onCancel((_props) =>
          Effect.succeed('GRAND CHILD TASK ON CANCEL' as const)
        )
        .onFail((_props) => Effect.succeed('GRAND CHILD TASK ON FAIL' as const))
        .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
          Effect.succeed('GRAND CHILD TASK ON START' as const)
        )
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('grandChildT'))
    .connectTask('grandChildT', (to) => to.condition('end'))
    .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
      Effect.succeed('GRAND CHILD WORKFLOW ON COMPLETE' as const)
    )
    .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
      Effect.succeed('GRAND CHILD WORKFLOW ON CANCEL' as const)
    )
    .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
      Effect.succeed('GRAND CHILD WORKFLOW ON FAIL' as const)
    )
    .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
      Effect.succeed('GRAND CHILD WORKFLOW ON START' as const)
    );

  const childWorkflow = Builder.workflow<ChildWorkflowContext>()
    .withName('child')
    .startCondition('start')
    .task('childT', (t) =>
      t()
        .withWorkItem((w) =>
          w<WorkItemPayload>()
            .onComplete(
              (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                Effect.succeed('CHILD WORK ITEM ON COMPLETE' as const)
            )
            .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
              Effect.succeed('CHILD WORK ITEM ON CANCEL' as const)
            )
            .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
              Effect.succeed('CHILD WORK ITEM ON FAIL' as const)
            )
            .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
              Effect.succeed('CHILD WORK ITEM ON START' as const)
            )
        )

        .onComplete((_props) =>
          Effect.succeed('CHILD TASK ON COMPLETE' as const)
        )
        .onCancel((_props) => Effect.succeed('CHILD TASK ON CANCEL' as const))
        .onFail((_props) => Effect.succeed('CHILD TASK ON FAIL' as const))
        .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
          Effect.succeed('CHILD TASK ON START' as const)
        )
    )
    .compositeTask('childCT', (ct) =>
      ct()
        .withSubWorkflow(grandChildWorkflow)
        .onComplete((_props) =>
          Effect.succeed('CHILD COMPOSITE TASK ON COMPLETE' as const)
        )
        .onCancel((_props) =>
          Effect.succeed('CHILD COMPOSITE TASK ON CANCEL' as const)
        )
        .onFail((_props) =>
          Effect.succeed('CHILD COMPOSITE TASK ON FAIL' as const)
        )
        .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
          Effect.succeed('CHILD COMPOSITE TASK ON START' as const)
        )
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('childT'))
    .connectTask('childT', (to) => to.task('childCT'))
    .connectTask('childCT', (to) => to.condition('end'))
    .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
      Effect.succeed('CHILD WORKFLOW ON COMPLETE' as const)
    )
    .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
      Effect.succeed('CHILD WORKFLOW ON CANCEL' as const)
    )
    .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
      Effect.succeed('CHILD WORKFLOW ON FAIL' as const)
    )
    .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
      Effect.succeed('CHILD WORKFLOW ON START' as const)
    );

  const compositeTask = Builder.compositeTask<WorkflowContext>()
    .withSubWorkflow(childWorkflow)
    .onComplete((_props) =>
      Effect.succeed('COMPOSITE TASK ON COMPLETE' as const)
    )
    .onCancel((_props) => Effect.succeed('COMPOSITE TASK ON CANCEL' as const))
    .onFail((_props) => Effect.succeed('COMPOSITE TASK ON FAIL' as const))
    .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
      Effect.succeed('COMPOSITE TASK ON START' as const)
    );

  const workflow = Builder.workflow<WorkflowContext>()
    .withName('test')
    .startCondition('start')
    .task('t', (t) =>
      t()
        .withWorkItem((w) =>
          w<WorkItemPayload>()
            .onComplete(
              (_props, _onCompleteInput: { onCompleteInput: boolean }) =>
                Effect.succeed('WORK ITEM ON COMPLETE' as const)
            )
            .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
              Effect.succeed('WORK ITEM ON CANCEL' as const)
            )
            .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
              Effect.succeed('WORK ITEM ON FAIL' as const)
            )
            .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
              Effect.succeed('WORK ITEM ON START' as const)
            )
        )

        .onComplete((_props) => Effect.succeed('TASK ON COMPLETE' as const))
        .onCancel((_props) => Effect.succeed('TASK ON CANCEL' as const))
        .onFail((_props) => Effect.succeed('TASK ON FAIL' as const))
        .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
          Effect.succeed('TASK ON START' as const)
        )
    )
    .compositeTask('ct', compositeTask)
    .endCondition('end')
    .connectCondition('start', (to) => to.task('t'))
    .connectTask('t', (to) => to.task('ct'))
    .connectTask('ct', (to) => to.condition('end'))
    .onComplete((_props, _onCompleteInput: { onCompleteInput: boolean }) =>
      Effect.succeed('ON COMPLETE' as const)
    )
    .onCancel((_props, _onCancelInput: { onCancelInput: boolean }) =>
      Effect.succeed('ON CANCEL' as const)
    )
    .onFail((_props, _onFailInput: { onFailInput: boolean }) =>
      Effect.succeed('ON FAIL' as const)
    )
    .onStart((_props, _onStartInput: { onStartInput: boolean }) =>
      Effect.succeed('ON START' as const)
    );
  type TestWorkflowMetadata = GetWorkflowBuilderMetadata<typeof workflow>;

  it('can correctly infer task payload types', () => {
    type TaskPayloads =
      WorkflowBuilderMetadataTaskPayloads<TestWorkflowMetadata>;

    type CompositeTaskPayloads =
      WorkflowBuilderMetadataCompositeTaskPayloads<TestWorkflowMetadata>;

    expectTypeOf<TaskPayloads>().toMatchTypeOf<{
      t: {
        type: 'task';
        path: 't';
        params: never;
        metadata: {
          _tag: 't';
          onStart: {
            input: { onStartInput: boolean };
            return: 'TASK ON START';
          };
        };
        workItemPayload: WorkItemPayload;
      };
      'ct.$childWorkflowId.childT': {
        type: 'task';
        path: 'ct.$childWorkflowId.childT';
        params: { childWorkflowId: string };
        metadata: {
          _tag: 'childT';
          onStart: {
            input: { onStartInput: boolean };
            return: 'CHILD TASK ON START';
          };
        };
        workItemPayload: WorkItemPayload;
      };
      'ct.$childWorkflowId.childCT.$grandChildWorkflowId.grandChildT': {
        type: 'task';
        path: 'ct.$childWorkflowId.childCT.$grandChildWorkflowId.grandChildT';
        params: { childWorkflowId: string; grandChildWorkflowId: string };
        metadata: {
          _tag: 'grandChildT';
          onStart: {
            input: { onStartInput: boolean };
            return: 'GRAND CHILD TASK ON START';
          };
        };
        workItemPayload: WorkItemPayload;
      };
    }>();

    expectTypeOf<CompositeTaskPayloads>().toMatchTypeOf<{
      ct: {
        type: 'compositeTask';
        path: 'ct';
        params: never;
        metadata: {
          _tag: 'ct';
          onStart: {
            input: { onStartInput: boolean };
            return: 'COMPOSITE TASK ON START';
          };
        };
        workflowContext: ChildWorkflowContext;
      };

      'ct.$childWorkflowId.childCT': {
        type: 'compositeTask';
        path: 'ct.$childWorkflowId.childCT';
        params: { childWorkflowId: string };
        metadata: {
          _tag: 'childCT';
          onStart: {
            input: { onStartInput: boolean };
            return: 'CHILD COMPOSITE TASK ON START';
          };
        };
        workflowContext: GrandChildWorkflowContext;
      };
    }>();
  });

  it('can correctly infer work item payload types', () => {
    type WorkItemPayloads =
      WorkflowBuilderMetadataWorkItemPayloads<TestWorkflowMetadata>;

    expectTypeOf<WorkItemPayloads>().toMatchTypeOf<{
      't.$tWorkItemId': {
        type: 'workItem';
        path: 't.$tWorkItemId';
        params: {
          tWorkItemId: string;
        };
        metadata: {
          _tag: 't';
          payload: WorkItemPayload;
          onStart: {
            input: {
              onStartInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'WORK ITEM ON START';
          };
          onComplete: {
            input: {
              onCompleteInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'WORK ITEM ON COMPLETE';
          };
          onCancel: {
            input: { onCancelInput: boolean };
            payload: WorkItemPayload;
            return: 'WORK ITEM ON CANCEL';
          };
          onFail: {
            input: {
              onFailInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'WORK ITEM ON FAIL';
          };
        };
      };

      'ct.$childWorkflowId.childT.$childTWorkItemId': {
        type: 'workItem';
        path: 'ct.$childWorkflowId.childT.$childTWorkItemId';
        params: {
          childTWorkItemId: string;
          childWorkflowId: string;
        };
        metadata: {
          _tag: 'childT';
          payload: WorkItemPayload;
          onStart: {
            input: {
              onStartInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'CHILD WORK ITEM ON START';
          };
          onComplete: {
            input: {
              onCompleteInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'CHILD WORK ITEM ON COMPLETE';
          };
          onCancel: {
            input: { onCancelInput: boolean };
            payload: WorkItemPayload;
            return: 'CHILD WORK ITEM ON CANCEL';
          };
          onFail: {
            input: {
              onFailInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'CHILD WORK ITEM ON FAIL';
          };
        };
      };

      'ct.$childWorkflowId.childCT.$grandChildWorkflowId.grandChildT.$grandChildTWorkItemId': {
        type: 'workItem';
        path: 'ct.$childWorkflowId.childCT.$grandChildWorkflowId.grandChildT.$grandChildTWorkItemId';
        params: {
          grandChildTWorkItemId: string;
          childWorkflowId: string;
          grandChildWorkflowId: string;
        };
        metadata: {
          _tag: 'grandChildT';
          payload: WorkItemPayload;
          onStart: {
            input: {
              onStartInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'GRAND CHILD WORK ITEM ON START';
          };
          onComplete: {
            input: {
              onCompleteInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'GRAND CHILD WORK ITEM ON COMPLETE';
          };
          onCancel: {
            input: { onCancelInput: boolean };
            payload: WorkItemPayload;
            return: 'GRAND CHILD WORK ITEM ON CANCEL';
          };
          onFail: {
            input: {
              onFailInput: boolean;
            };
            payload: WorkItemPayload;
            return: 'GRAND CHILD WORK ITEM ON FAIL';
          };
        };
      };
    }>();
  });

  it('can correctly infer workflow payload types', () => {
    type WorkflowPayloads =
      WorkflowBuilderMetadataWorkflowPayloads<TestWorkflowMetadata>;

    expectTypeOf<WorkflowPayloads>().toMatchTypeOf<{
      'ct.$childWorkflowId': {
        type: 'workflow';
        path: 'ct.$childWorkflowId';
        params: {
          childWorkflowId: string;
        };
        metadata: {
          onStart: {
            input: { onStartInput: boolean };
            return: 'CHILD WORKFLOW ON START';
          };
          onComplete: {
            input: { onCompleteInput: boolean };
            return: 'CHILD WORKFLOW ON COMPLETE';
          };
          onCancel: {
            input: { onCancelInput: boolean };
            return: 'CHILD WORKFLOW ON CANCEL';
          };
          onFail: {
            input: { onFailInput: boolean };
            return: 'CHILD WORKFLOW ON FAIL';
          };
          name: 'child';
          context: ChildWorkflowContext;
        };
      };
      'ct.$childWorkflowId.childCT.$grandChildWorkflowId': {
        type: 'workflow';
        path: 'ct.$childWorkflowId.childCT.$grandChildWorkflowId';
        params: {
          childWorkflowId: string;
          grandChildWorkflowId: string;
        };
        metadata: {
          onStart: {
            input: { onStartInput: boolean };
            return: 'GRAND CHILD WORKFLOW ON START';
          };
          onComplete: {
            input: { onCompleteInput: boolean };
            return: 'GRAND CHILD WORKFLOW ON COMPLETE';
          };
          onCancel: {
            input: { onCancelInput: boolean };
            return: 'GRAND CHILD WORKFLOW ON CANCEL';
          };
          onFail: {
            input: { onFailInput: boolean };
            return: 'GRAND CHILD WORKFLOW ON FAIL';
          };
          name: 'grandChild';
          context: GrandChildWorkflowContext;
        };
      };
    }>();
  });
});
