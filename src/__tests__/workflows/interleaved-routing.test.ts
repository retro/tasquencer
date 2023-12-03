import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('supports the interleaved routing pattern', ({ expect }) => {
  const workflowDefinition = Builder.workflow()
    .withName('interleaved-parallel')
    .startCondition('start')
    .condition('mutex')
    .task('initial_task', Builder.emptyTask())
    .task(
      'task_a',
      Builder.emptyTask().withSplitType('and').withJoinType('and')
    )
    .task(
      'task_b',
      Builder.emptyTask().withSplitType('and').withJoinType('and')
    )
    .task(
      'task_c',
      Builder.emptyTask().withSplitType('and').withJoinType('and')
    )
    .task(
      'task_d',
      Builder.emptyTask().withSplitType('and').withJoinType('and')
    )
    .task('finish_task', Builder.emptyTask().withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('initial_task'))
    .connectTask('initial_task', (to) =>
      to.condition('mutex').task('task_a').task('task_c')
    )
    .connectTask('task_a', (to) => to.task('task_b').condition('mutex'))
    .connectTask('task_b', (to) => to.task('finish_task').condition('mutex'))
    .connectTask('task_c', (to) => to.task('task_d').condition('mutex'))
    .connectTask('task_d', (to) => to.task('finish_task').condition('mutex'))
    .connectTask('finish_task', (to) => to.condition('end'))
    .connectCondition('mutex', (to) =>
      to.task('task_a').task('task_b').task('task_c').task('task_d')
    )
    .cancellationRegion('finish_task', { conditions: ['mutex'] });

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service.getState())).toMatchSnapshot();

    yield* $(service.start());
    const state1 = yield* $(service.getState());
    expect(state1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1)).toEqual(new Set(['initial_task']));

    yield* $(service.startTask('initial_task'));
    const state2 = yield* $(service.getState());
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['task_a', 'task_c']));

    yield* $(service.startTask('task_a'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['task_c', 'task_b']));

    yield* $(service.startTask('task_b'));
    const state4 = yield* $(service.getState());
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set(['task_c']));

    yield* $(service.startTask('task_c'));
    const state5 = yield* $(service.getState());
    expect(state5).toMatchSnapshot();
    expect(getEnabledTaskNames(state5)).toEqual(new Set(['task_d']));

    yield* $(service.startTask('task_d'));
    const state6 = yield* $(service.getState());
    expect(state6).toMatchSnapshot();
    expect(getEnabledTaskNames(state6)).toEqual(new Set(['finish_task']));

    yield* $(service.startTask('finish_task'));
    const state7 = yield* $(service.getState());
    expect(state7).toMatchSnapshot();
    expect(state7.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
