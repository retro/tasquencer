import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with "or" split and "or" join', () => {
  const workflowDefinition = Builder.workflow<{
    shouldBookFlight: boolean;
    shouldBookCar: boolean;
  }>()
    .withName('or-split-join')
    .startCondition('start')
    .task('register', Builder.emptyTask().withSplitType('or'))
    .task('book_flight', Builder.emptyTask())
    .task('book_hotel', Builder.emptyTask())
    .task('book_car', Builder.emptyTask())
    .task('pay', Builder.emptyTask().withJoinType('or'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('register'))
    .connectTask('register', (to) =>
      to
        .task('book_flight', ({ context }) =>
          Effect.succeed(context.shouldBookFlight)
        )
        .task('book_car', ({ context }) =>
          Effect.succeed(context.shouldBookCar)
        )
        .defaultTask('book_hotel')
    )
    .connectTask('book_flight', (to) => to.task('pay'))
    .connectTask('book_hotel', (to) => to.task('pay'))
    .connectTask('book_car', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service1 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          shouldBookFlight: true,
          shouldBookCar: true,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service1.getState())).toMatchSnapshot();

    yield* $(service1.start());
    const state1_1 = yield* $(service1.getState());
    expect(state1_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_1)).toEqual(new Set(['register']));

    yield* $(service1.startTask('register'));
    const state1_2 = yield* $(service1.getState());
    expect(state1_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_2)).toEqual(
      new Set(['book_flight', 'book_car', 'book_hotel'])
    );

    yield* $(service1.startTask('book_flight'));
    const state1_3 = yield* $(service1.getState());
    expect(state1_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_3)).toEqual(
      new Set(['book_car', 'book_hotel'])
    );

    yield* $(service1.startTask('book_car'));
    const state1_4 = yield* $(service1.getState());
    expect(state1_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_4)).toEqual(new Set(['book_hotel']));

    yield* $(service1.startTask('book_hotel'));
    const state1_5 = yield* $(service1.getState());
    expect(state1_5).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_5)).toEqual(new Set(['pay']));

    yield* $(service1.startTask('pay'));
    const state1_6 = yield* $(service1.getState());
    expect(state1_6).toMatchSnapshot();
    expect(state1_6.workflows[0]?.state).toBe('completed');

    const service2 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          shouldBookFlight: true,
          shouldBookCar: false,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service2.getState())).toMatchSnapshot();

    yield* $(service2.start());
    const state2_1 = yield* $(service2.getState());
    expect(state2_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_1)).toEqual(new Set(['register']));

    yield* $(service2.startTask('register'));
    const state2_2 = yield* $(service2.getState());
    expect(state2_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_2)).toEqual(
      new Set(['book_flight', 'book_hotel'])
    );

    yield* $(service2.startTask('book_flight'));
    const state2_3 = yield* $(service2.getState());
    expect(state2_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_3)).toEqual(new Set(['book_hotel']));

    yield* $(service2.startTask('book_hotel'));
    const state2_4 = yield* $(service2.getState());
    expect(state2_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_4)).toEqual(new Set(['pay']));

    yield* $(service2.startTask('pay'));
    const state2_5 = yield* $(service2.getState());
    expect(state2_5).toMatchSnapshot();
    expect(state2_5.workflows[0]?.state).toBe('completed');

    const service3 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          shouldBookFlight: false,
          shouldBookCar: false,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service3.getState())).toMatchSnapshot();

    yield* $(service3.start());
    const state3_1 = yield* $(service3.getState());
    expect(state3_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state3_1)).toEqual(new Set(['register']));

    yield* $(service3.startTask('register'));
    const state3_2 = yield* $(service3.getState());
    expect(state3_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state3_2)).toEqual(new Set(['book_hotel']));

    yield* $(service3.startTask('book_hotel'));
    const state3_3 = yield* $(service3.getState());
    expect(state3_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3_3)).toEqual(new Set(['pay']));

    yield* $(service3.startTask('pay'));
    const state3_4 = yield* $(service3.getState());
    expect(state3_4).toMatchSnapshot();
    expect(state3_4.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
