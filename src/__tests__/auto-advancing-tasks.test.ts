import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', (t) =>
    t()
      .withWorkItem((w) =>
        w().onStart(({ startWorkItem }) =>
          Effect.gen(function* ($) {
            const { enqueueCompleteWorkItem } = yield* $(startWorkItem());
            yield* $(enqueueCompleteWorkItem());
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
  .task('t2', (t) =>
    t()
      .onEnable(({ enableTask }) =>
        Effect.gen(function* ($) {
          const { enqueueStartTask } = yield* $(enableTask());
          yield* $(enqueueStartTask());
        })
      )
      .onStart(({ startTask }) =>
        Effect.gen(function* ($) {
          yield* $(startTask());
        })
      )
      .withShouldComplete(() => Effect.succeed(true))
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2'))
  .connectTask('t2', (to) => to.condition('end'));

it('handles series of auto advancing tasks', ({ expect }) => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
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
