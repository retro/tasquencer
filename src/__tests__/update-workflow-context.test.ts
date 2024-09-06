import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { makeIdGenerator } from './shared.js';

const workflowDefinition1 = Builder.workflow<{ count: number }>()
  .withName('activities')
  .startCondition('start')
  .task('t1', (t) =>
    t().onEnable(({ enableTask, getWorkflowContext, updateWorkflowContext }) =>
      Effect.gen(function* () {
        const { enqueueStartTask } = yield* enableTask();
        yield* enqueueStartTask();
        const workflowContext = yield* getWorkflowContext();
        const { count } = workflowContext;
        yield* updateWorkflowContext({ count: count + 1 });
      })
    )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'))
  .onStart(({ getWorkflowContext, updateWorkflowContext }) =>
    Effect.gen(function* () {
      const workflowContext = yield* getWorkflowContext();
      const { count } = workflowContext;
      yield* updateWorkflowContext({ count: count + 1 });
    })
  );

it('handles context update when value is passed', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition1.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, { count: 0 })),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(state);
  });

  Effect.runSync(program);
});

const workflowDefinition2 = Builder.workflow<{ count: number }>()
  .withName('activities')
  .startCondition('start')
  .task('t1', (t) =>
    t().onEnable(({ enableTask, updateWorkflowContext }) =>
      Effect.gen(function* () {
        const { enqueueStartTask } = yield* enableTask();
        yield* enqueueStartTask();
        yield* updateWorkflowContext(({ count }) => ({ count: count + 1 }));
      })
    )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'))
  .onStart(({ updateWorkflowContext }) =>
    Effect.gen(function* () {
      yield* updateWorkflowContext(({ count }) => ({ count: count + 1 }));
    })
  );

it('handles context update when updater function is passed', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition2.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, { count: 0 })),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();

    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(state);
  });

  Effect.runSync(program);
});

const subWorkflowDefinition1 = Builder.workflow()
  .withName('sub')
  .withParentContext<{ count: number }>()
  .startCondition('start')
  .task('subT1')
  .endCondition('end')
  .connectCondition('start', (to) => to.task('subT1'))
  .connectTask('subT1', (to) => to.condition('end'))
  .onStart(({ updateParentWorkflowContext }) =>
    updateParentWorkflowContext(({ count }) => ({ count: count + 1 }))
  );

const parentWorkflowDefinition1 = Builder.workflow<{ count: number }>()
  .withName('activities')
  .startCondition('start')
  .compositeTask('t1', (ct) =>
    ct()
      .withSubWorkflow(subWorkflowDefinition1)
      .onStart(({ startTask }) =>
        Effect.gen(function* () {
          const { initializeWorkflow, enqueueStartWorkflow } =
            yield* startTask();
          const workflow = yield* initializeWorkflow();
          yield* enqueueStartWorkflow(workflow.id);
        })
      )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'));

it('handles parent context update when updater function is passed', ({
  expect,
}) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* parentWorkflowDefinition1.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, { count: 0 })),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();
    yield* service.startTask('t1');

    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(state);
  });

  Effect.runSync(program);
});

const subWorkflowDefinition2 = Builder.workflow()
  .withName('sub')
  .withParentContext<{ count: number }>()
  .startCondition('start')
  .task('subT1')
  .endCondition('end')
  .connectCondition('start', (to) => to.task('subT1'))
  .connectTask('subT1', (to) => to.condition('end'))
  .onStart(({ updateParentWorkflowContext }) =>
    updateParentWorkflowContext({ count: 1 })
  );

const parentWorkflowDefinition2 = Builder.workflow<{ count: number }>()
  .withName('activities')
  .startCondition('start')
  .compositeTask('t1', (ct) =>
    ct()
      .withSubWorkflow(subWorkflowDefinition2)
      .onStart(({ startTask }) =>
        Effect.gen(function* () {
          const { initializeWorkflow, enqueueStartWorkflow } =
            yield* startTask();
          const workflow = yield* initializeWorkflow();
          yield* enqueueStartWorkflow(workflow.id);
        })
      )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'));

it('handles parent context update when value is passed', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* parentWorkflowDefinition2.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow, { count: 0 })),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();
    yield* service.startTask('t1');

    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(state);
  });

  Effect.runSync(program);
});
