import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import * as Builder from '../builder.js';
import * as Interpreter from '../interpreter2.js';
import { createMemory } from '../stateManager/memory.js';
import { IdGenerator, StateManager } from '../stateManager/types.js';

function makeIdGenerator(): IdGenerator {
  const ids = {
    task: 0,
    condition: 0,
    workflow: 0,
  };
  return {
    next(type) {
      ids[type]++;
      return Effect.succeed(`${type}-${ids[type]}`);
    },
  };
}

it('can run simple net with and-split and and-join', () => {
  const workflow = Builder.workflow()
    .startCondition('start')
    .task('scan_goods')
    .task('pay', (t) => t.withSplitType('and'))
    .task('pack_goods')
    .task('issue_receipt')
    .task('check_goods', (t) => t.withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('scan_goods'))
    .connectTask('scan_goods', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.task('pack_goods').task('issue_receipt'))
    .connectTask('pack_goods', (to) => to.task('check_goods'))
    .connectTask('issue_receipt', (to) => to.task('check_goods'))
    .connectTask('check_goods', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const interpreter = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideServiceEffect(StateManager, createMemory()),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(interpreter.start());

    const res1 = yield* $(interpreter.getState());

    expect(res1).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('scan_goods'));

    const res2 = yield* $(interpreter.getState());

    expect(res2).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'active' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
      },
    });

    yield* $(interpreter.completeTask('scan_goods'));

    const res3 = yield* $(interpreter.getState());

    expect(res3).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('pay'));

    const res4 = yield* $(interpreter.getState());

    expect(res4).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'active' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('pay'));

    const res5 = yield* $(interpreter.getState());

    expect(res5).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'enabled' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 1,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('pack_goods'));

    const res6 = yield* $(interpreter.getState());

    expect(res6).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'active' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    const res7 = yield* $(interpreter.getState());

    expect(res7).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'active' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('issue_receipt'));

    const res8 = yield* $(interpreter.getState());

    expect(res8).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'active' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'active' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('pack_goods'));

    const res9 = yield* $(interpreter.getState());

    expect(res9).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'completed' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'active' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:pack_goods->check_goods',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.completeTask('issue_receipt'));

    const res10 = yield* $(interpreter.getState());

    expect(res10).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'completed' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'completed' },
        'task-10': { id: 'task-10', name: 'check_goods', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:pack_goods->check_goods',
          marking: 1,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:issue_receipt->check_goods',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('check_goods'));

    const res11 = yield* $(interpreter.getState());

    expect(res11).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'completed' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'completed' },
        'task-10': { id: 'task-10', name: 'check_goods', state: 'active' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:pack_goods->check_goods',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:issue_receipt->check_goods',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('check_goods'));

    const res12 = yield* $(interpreter.getState());

    expect(res12).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'scan_goods', state: 'completed' },
        'task-7': { id: 'task-7', name: 'pay', state: 'completed' },
        'task-8': { id: 'task-8', name: 'pack_goods', state: 'completed' },
        'task-9': { id: 'task-9', name: 'issue_receipt', state: 'completed' },
        'task-10': { id: 'task-10', name: 'check_goods', state: 'completed' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:pack_goods->check_goods',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:issue_receipt->check_goods',
          marking: 0,
        },
        'condition-14': { id: 'condition-14', name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});
