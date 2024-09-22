import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

type WorkflowContext = 'complete' | 'fail' | 'cancel';
type WorkItemPayload = WorkflowContext;

const subWorkflowDefinition = Builder.workflow<WorkflowContext>()
  .withName('sub')
  .startCondition('start')
  .task('subT1', (t) =>
    t()
      .withWorkItem((w) =>
        w<WorkItemPayload>().onStart(({ startWorkItem, getWorkItem }) =>
          Effect.gen(function* () {
            const { payload } = yield* getWorkItem();
            const {
              enqueueCancelWorkItem,
              enqueueCompleteWorkItem,
              enqueueFailWorkItem,
            } = yield* startWorkItem();
            if (payload === 'cancel') {
              yield* enqueueCancelWorkItem();
            } else if (payload === 'fail') {
              yield* enqueueFailWorkItem();
            } else {
              yield* enqueueCompleteWorkItem();
            }
          })
        )
      )
      .onEnable(({ enableTask }) =>
        Effect.gen(function* () {
          const { enqueueStartTask } = yield* enableTask();
          yield* enqueueStartTask();
        })
      )
      .onStart(({ startTask, getWorkflowContext }) =>
        Effect.gen(function* () {
          const workflowContext = yield* getWorkflowContext();
          const { initializeWorkItem, enqueueStartWorkItem } =
            yield* startTask();
          const { id } = yield* initializeWorkItem(workflowContext);
          yield* enqueueStartWorkItem(id);
        })
      )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('subT1'))
  .connectTask('subT1', (to) => to.condition('end'));

const workflowDefinition = Builder.workflow<WorkflowContext>()
  .withName('activities')
  .startCondition('start')
  .compositeTask('t1', (ct) =>
    ct()
      .withSubWorkflow(subWorkflowDefinition)
      .onEnable(({ enableTask }) =>
        Effect.gen(function* () {
          const { enqueueStartTask } = yield* enableTask();
          yield* enqueueStartTask();
        })
      )
      .onStart(({ startTask, getWorkflowContext }) =>
        Effect.gen(function* () {
          const workflowContext = yield* getWorkflowContext();
          const { initializeWorkflow, enqueueStartWorkflow } =
            yield* startTask();
          const { id } = yield* initializeWorkflow(workflowContext);
          yield* enqueueStartWorkflow(id);
        })
      )
  )

  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'));

it('handles nested enqueueing (1)', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, 'complete')),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.startRootWorkflow();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('completed');
  });

  Effect.runSync(program);
});

it('handles nested enqueueing (2)', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, 'cancel')),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.startRootWorkflow();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('started');
  });

  Effect.runSync(program);
});

it('handles nested enqueueing (3)', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, 'fail')),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.startRootWorkflow();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('failed');
  });

  Effect.runSync(program);
});
