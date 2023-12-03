import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with "xor" join', () => {
  const workflowDefinition = Builder.workflow()
    .withName('xor-join')
    .startCondition('start')
    .task('initial_task', Builder.emptyTask())
    .condition('choice')
    .task('task_a', Builder.emptyTask())
    .task('task_b', Builder.emptyTask())
    .task('task_c', Builder.emptyTask())
    .task('finish_task', Builder.emptyTask().withJoinType('xor'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('initial_task'))
    .connectTask('initial_task', (to) => to.condition('choice'))
    .connectCondition('choice', (to) =>
      to.task('task_a').task('task_b').task('task_c')
    )
    .connectTask('task_a', (to) => to.task('finish_task'))
    .connectTask('task_b', (to) => to.task('finish_task'))
    .connectTask('task_c', (to) => to.task('finish_task'))
    .connectTask('finish_task', (to) => to.condition('end'));
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
    expect(getEnabledTaskNames(state2)).toEqual(
      new Set(['task_a', 'task_b', 'task_c'])
    );

    yield* $(service.startTask('task_b'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['finish_task']));
  });

  Effect.runSync(program);
});
