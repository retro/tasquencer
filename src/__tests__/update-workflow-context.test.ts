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

    yield* service.startRootWorkflow();
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

    yield* service.startRootWorkflow();

    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(state);
  });

  Effect.runSync(program);
});
