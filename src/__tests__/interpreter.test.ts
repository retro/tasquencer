import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import { Builder } from '../index.js';
import { makeInterpreter } from '../interpreter2.js';
import { createMemory } from '../stateManager/memory.js';
import { StateManager } from '../stateManager/types.js';

it('can run simple net with and-split and and-join', () => {
  const builder = new Builder<null>();
  const net = builder
    .addStartCondition('start')
    .addEndCondition('end')
    .addTask('scan_goods', {})
    .addTask('pay', { splitType: 'and' })
    .addTask('pack_goods', {})
    .addTask('issue_receipt', {})
    .addTask('check_goods', { joinType: 'and' })
    .connectConditionToTask('start', 'scan_goods')
    .connectTaskToTask('scan_goods', 'pay')
    .connectTaskToTask('pay', 'pack_goods')
    .connectTaskToTask('pay', 'issue_receipt')
    .connectTaskToTask('pack_goods', 'check_goods')
    .connectTaskToTask('issue_receipt', 'check_goods')
    .connectTaskToCondition('check_goods', 'end')
    .toNet();

  const program = Effect.gen(function* ($) {
    const interpreter = yield* $(
      makeInterpreter(net),
      Effect.provideServiceEffect(StateManager, createMemory())
    );

    yield* $(interpreter.start());

    const res1 = yield* $(interpreter.getState());

    expect(res1).toEqual({
      tasks: { scan_goods: { name: 'scan_goods', state: 'enabled' } },
      conditions: { start: { name: 'start', marking: 1 } },
    });

    yield* $(interpreter.activateTask('scan_goods'));

    const res2 = yield* $(interpreter.getState());

    expect(res2).toEqual({
      tasks: { scan_goods: { name: 'scan_goods', state: 'active' } },
      conditions: { start: { name: 'start', marking: 0 } },
    });

    yield* $(interpreter.completeTask('scan_goods'));

    const res3 = yield* $(interpreter.getState());

    expect(res3).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'enabled' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('pay'));

    const res4 = yield* $(interpreter.getState());

    expect(res4).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'active' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('pay'));

    const res5 = yield* $(interpreter.getState());

    expect(res5).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'enabled' },
        issue_receipt: { name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 1,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('pack_goods'));

    const res6 = yield* $(interpreter.getState());

    expect(res6).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'active' },
        issue_receipt: { name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    const res7 = yield* $(interpreter.getState());

    expect(res7).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'active' },
        issue_receipt: { name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('issue_receipt'));

    const res8 = yield* $(interpreter.getState());

    expect(res8).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'active' },
        issue_receipt: { name: 'issue_receipt', state: 'active' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('pack_goods'));

    const res9 = yield* $(interpreter.getState());

    expect(res9).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'completed' },
        issue_receipt: { name: 'issue_receipt', state: 'active' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'implicit:pack_goods->check_goods': {
          name: 'implicit:pack_goods->check_goods',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.completeTask('issue_receipt'));

    const res10 = yield* $(interpreter.getState());

    expect(res10).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'completed' },
        issue_receipt: { name: 'issue_receipt', state: 'completed' },
        check_goods: { name: 'check_goods', state: 'enabled' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'implicit:pack_goods->check_goods': {
          name: 'implicit:pack_goods->check_goods',
          marking: 1,
        },
        'implicit:issue_receipt->check_goods': {
          name: 'implicit:issue_receipt->check_goods',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('check_goods'));

    const res11 = yield* $(interpreter.getState());

    expect(res11).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'completed' },
        issue_receipt: { name: 'issue_receipt', state: 'completed' },
        check_goods: { name: 'check_goods', state: 'active' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'implicit:pack_goods->check_goods': {
          name: 'implicit:pack_goods->check_goods',
          marking: 0,
        },
        'implicit:issue_receipt->check_goods': {
          name: 'implicit:issue_receipt->check_goods',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('check_goods'));

    const res12 = yield* $(interpreter.getState());

    expect(res12).toEqual({
      tasks: {
        scan_goods: { name: 'scan_goods', state: 'completed' },
        pay: { name: 'pay', state: 'completed' },
        pack_goods: { name: 'pack_goods', state: 'completed' },
        issue_receipt: { name: 'issue_receipt', state: 'completed' },
        check_goods: { name: 'check_goods', state: 'completed' },
      },
      conditions: {
        start: { name: 'start', marking: 0 },
        'implicit:scan_goods->pay': {
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'implicit:pay->pack_goods': {
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'implicit:pay->issue_receipt': {
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'implicit:pack_goods->check_goods': {
          name: 'implicit:pack_goods->check_goods',
          marking: 0,
        },
        'implicit:issue_receipt->check_goods': {
          name: 'implicit:issue_receipt->check_goods',
          marking: 0,
        },
        end: { name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});
