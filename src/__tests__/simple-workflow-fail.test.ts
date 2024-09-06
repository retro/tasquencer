import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', Builder.emptyTask().withSplitType('and'))
  .task('t2')
  .task('t3')
  .task('t4', Builder.emptyTask().withJoinType('and'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2').task('t3'))
  .connectTask('t2', (to) => to.task('t4'))
  .connectTask('t3', (to) => to.task('t4'))
  .connectTask('t4', (to) => to.condition('end'));

it('handles workflow failure in simple workflows (1)', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set(['t1']));

    yield* service.startTask('t1');
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2', 't3']));

    yield* service.startTask('t2');
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['t3']));

    const { id } = yield* service.initializeWorkItem('t2');
    yield* service.initializeWorkItem('t2');
    yield* service.startWorkItem(`t2.${id}`);
    yield* service.failWorkItem(`t2.${id}`);
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());
    expect(state4.workflows[0]?.state).toEqual('failed');
  });

  Effect.runSync(program);
});

it('handles workflow failure in simple workflows (2)', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set(['t1']));

    yield* service.startTask('t1');
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2', 't3']));

    yield* service.startTask('t2');
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['t3']));

    yield* service.startTask('t3');
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());

    const { id } = yield* service.initializeWorkItem('t2');
    yield* service.initializeWorkItem('t2');
    const { id: id2 } = yield* service.initializeWorkItem('t3');
    yield* service.initializeWorkItem('t3');
    yield* service.startWorkItem(`t2.${id}`);
    yield* service.startWorkItem(`t3.${id2}`);
    yield* service.failWorkItem(`t2.${id}`);
    const state5 = yield* service.getState();
    expect(state5).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());
    expect(state5.workflows[0]?.state).toEqual('failed');
  });

  Effect.runSync(program);
});
