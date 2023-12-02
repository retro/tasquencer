import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with multiple "or" splits and "or" joins (1)', () => {
  const workflowDefinition = Builder.workflow<{ isTaskDEnabled: boolean }>()
    .withName('multiple-or-join-1')
    .startCondition('start')
    .task('A', Builder.emptyTask().withSplitType('and'))
    .task('B', Builder.emptyTask())
    .task('C', Builder.emptyTask().withSplitType('or'))
    .task('D', Builder.emptyTask())
    .task('E', Builder.emptyTask().withJoinType('or'))
    .task('F', Builder.emptyTask().withJoinType('or'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.task('B').task('C'))
    .connectTask('B', (to) => to.task('F'))
    .connectTask('C', (to) =>
      to
        .task('D', ({ context }) => Effect.succeed(context.isTaskDEnabled))
        .defaultTask('E')
    )
    .connectTask('D', (to) => to.task('E'))
    .connectTask('E', (to) => to.task('F'))
    .connectTask('F', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service1 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          isTaskDEnabled: true,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service1.getState())).toMatchSnapshot();

    yield* $(service1.start());
    const state1_1 = yield* $(service1.getState());
    expect(state1_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_1)).toEqual(new Set(['A']));

    yield* $(service1.fireTask('A'));
    const state1_2 = yield* $(service1.getState());
    expect(state1_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_2)).toEqual(new Set(['B', 'C']));

    yield* $(service1.fireTask('B'));
    const state1_3 = yield* $(service1.getState());
    expect(state1_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_3)).toEqual(new Set(['C']));

    yield* $(service1.fireTask('C'));
    const state1_4 = yield* $(service1.getState());
    expect(state1_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_4)).toEqual(new Set(['D']));

    yield* $(service1.fireTask('D'));
    const state1_5 = yield* $(service1.getState());
    expect(state1_5).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_5)).toEqual(new Set(['E']));

    yield* $(service1.fireTask('E'));
    const state1_6 = yield* $(service1.getState());
    expect(state1_6).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_6)).toEqual(new Set(['F']));

    yield* $(service1.fireTask('F'));
    const state1_7 = yield* $(service1.getState());
    expect(state1_7).toMatchSnapshot();
    expect(state1_7.workflows[0]?.state).toBe('completed');

    const service2 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          isTaskDEnabled: false,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service2.getState())).toMatchSnapshot();

    yield* $(service2.start());
    const state2_1 = yield* $(service2.getState());
    expect(state2_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_1)).toEqual(new Set(['A']));

    yield* $(service2.fireTask('A'));
    const state2_2 = yield* $(service2.getState());
    expect(state2_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_2)).toEqual(new Set(['B', 'C']));

    yield* $(service2.fireTask('B'));
    const state2_3 = yield* $(service2.getState());
    expect(state2_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_3)).toEqual(new Set(['C']));

    yield* $(service2.fireTask('C'));
    const state2_4 = yield* $(service2.getState());
    expect(state2_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_4)).toEqual(new Set(['E']));

    yield* $(service2.fireTask('E'));
    const state2_5 = yield* $(service2.getState());
    expect(state2_5).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_5)).toEqual(new Set(['F']));

    yield* $(service2.fireTask('F'));
    const state2_6 = yield* $(service2.getState());
    expect(state2_6).toMatchSnapshot();
    expect(state2_6.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
