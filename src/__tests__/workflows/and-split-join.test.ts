import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with "and" split and "and" join', ({ expect }) => {
  const workflowDefinition = Builder.workflow()
    .withName('checkout')
    .startCondition('start')
    .task('scan_goods', Builder.emptyTask())
    .task('pay', Builder.emptyTask().withSplitType('and'))
    .task('pack_goods', Builder.emptyTask())
    .task('issue_receipt', Builder.emptyTask())
    .task('check_goods', Builder.emptyTask().withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('scan_goods'))
    .connectTask('scan_goods', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.task('pack_goods').task('issue_receipt'))
    .connectTask('pack_goods', (to) => to.task('check_goods'))
    .connectTask('issue_receipt', (to) => to.task('check_goods'))
    .connectTask('check_goods', (to) => to.condition('end'));

  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* service.getState()).toMatchSnapshot();

    yield* service.startRootWorkflow();
    const state1 = yield* service.getState();
    expect(state1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1)).toEqual(new Set(['scan_goods']));

    yield* service.startTask('scan_goods', {});
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['pay']));

    yield* service.startTask('pay', {});
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(
      new Set(['pack_goods', 'issue_receipt'])
    );

    yield* service.startTask('pack_goods', {});
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set(['issue_receipt']));

    yield* service.startTask('issue_receipt', {});
    const state5 = yield* service.getState();
    expect(state5).toMatchSnapshot();
    expect(getEnabledTaskNames(state5)).toEqual(new Set(['check_goods']));

    yield* service.startTask('check_goods', {});
    const state6 = yield* service.getState();
    expect(state6).toMatchSnapshot();
    expect(state6.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
