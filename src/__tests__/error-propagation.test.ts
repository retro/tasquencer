import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { makeIdGenerator } from './shared.js';

function fail(message: string) {
  return Effect.fail(new Error(message));
}

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', (t) =>
    t()
      .withWorkItem((w) =>
        w().onStart(({ startWorkItem }) =>
          Effect.gen(function* () {
            const { enqueueCompleteWorkItem } = yield* startWorkItem();
            yield* fail('Failing');
            yield* enqueueCompleteWorkItem();
          })
        )
      )
      .onEnable(({ enableTask }) =>
        Effect.gen(function* () {
          const { enqueueStartTask } = yield* enableTask();
          yield* enqueueStartTask();
        })
      )
      .onStart(({ startTask }) =>
        Effect.gen(function* () {
          const { initializeWorkItem, enqueueStartWorkItem } =
            yield* startTask();
          const { id } = yield* initializeWorkItem();
          yield* enqueueStartWorkItem(id);
        })
      )
  )
  .task('t2', (t) =>
    t()
      .onEnable(({ enableTask }) =>
        Effect.gen(function* () {
          const { enqueueStartTask } = yield* enableTask();
          yield* enqueueStartTask();
        })
      )
      .onStart(({ startTask }) =>
        Effect.gen(function* () {
          yield* startTask();
        })
      )
      .withShouldComplete(() => Effect.succeed(true))
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2'))
  .connectTask('t2', (to) => to.condition('end'));

it('correctly propagates errors', ({ expect }) => {
  const program = Effect.gen(function* () {
    let errorHandlerCalled = false;
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start().pipe(
      Effect.catchAll((error) => {
        if (error instanceof Error) {
          errorHandlerCalled = true;
          expect(error.message).toBe('Failing');
        }
        return Effect.void;
      })
    );

    expect(errorHandlerCalled).toBe(true);
  });

  Effect.runSync(program);
});
