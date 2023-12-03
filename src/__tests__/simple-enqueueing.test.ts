import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const workflowDefinition = Builder.workflow<'complete' | 'fail' | 'cancel'>()
  .withName('activities')
  .startCondition('start')
  .task('t1', (t) =>
    t()
      .withWorkItem((w) =>
        w().onStart(({ startWorkItem, getWorkflowContext }) =>
          Effect.gen(function* ($) {
            const context = yield* $(getWorkflowContext());
            const {
              enqueueCancelWorkItem,
              enqueueCompleteWorkItem,
              enqueueFailWorkItem,
            } = yield* $(startWorkItem());
            if (context === 'cancel') {
              yield* $(enqueueCancelWorkItem());
            } else if (context === 'fail') {
              yield* $(enqueueFailWorkItem());
            } else {
              yield* $(enqueueCompleteWorkItem());
            }
          })
        )
      )
      .onEnable(({ enableTask }) =>
        Effect.gen(function* ($) {
          const { enqueueStartTask } = yield* $(enableTask());
          yield* $(enqueueStartTask());
        })
      )
      .onStart(({ startTask }) =>
        Effect.gen(function* ($) {
          const { initializeWorkItem, enqueueStartWorkItem } = yield* $(
            startTask()
          );
          const { id } = yield* $(initializeWorkItem());
          yield* $(enqueueStartWorkItem(id));
        })
      )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'));

it('handles simple enqueueing (1)', () => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow, 'complete')),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());
    const state = yield* $(service.getState());
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('completed');
  });

  Effect.runSync(program);
});

it('handles simple enqueueing (2)', () => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow, 'cancel')),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());
    const state = yield* $(service.getState());
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('started');
  });

  Effect.runSync(program);
});

it('handles simple enqueueing (3)', () => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow, 'fail')),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());
    const state = yield* $(service.getState());
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('failed');
  });

  Effect.runSync(program);
});
