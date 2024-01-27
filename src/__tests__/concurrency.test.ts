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
        w<number>().onStart(({ startWorkItem, getWorkItem }) =>
          Effect.gen(function* ($) {
            const { enqueueCompleteWorkItem } = yield* $(startWorkItem());
            const workItem = yield* $(getWorkItem());
            yield* $(Effect.sleep(`${workItem.payload * 100} millis`));
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
          for (const i of [1, 2, 3]) {
            const { id } = yield* $(initializeWorkItem(i));
            yield* $(enqueueStartWorkItem(id));
          }
        })
      )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'));

it('will start work items concurrently and emit state change on each work item start', async ({
  expect,
}) => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();
    const logs: unknown[] = [];

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    service.onStateChange((changes) => {
      return Effect.succeed(logs.push(changes));
    });

    yield* $(service.start());
    const state = yield* $(service.getState());
    expect(state).toMatchSnapshot();
    expect(logs).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set());
    expect(state.workflows[0]?.state).toEqual('completed');
  });

  await Effect.runPromise(program);
});
