import * as Data from '@effect/data/Data';
import { pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as HashSet from '@effect/data/HashSet';
import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import { Builder } from '../index.js';
import { makeInterpreter } from '../interpreter2.js';
import { createMemory } from '../state-manager/memory.js';
import { StateManager } from '../state-manager/types.js';
import { InterpreterState, WTaskState } from '../types.js';

interface JSInterpreterState {
  markings: Record<string, number>;
  tasks: Record<string, WTaskState>;
}

function toInterpreterState(jsState: JSInterpreterState): InterpreterState {
  return Data.struct({
    markings: HashMap.fromIterable<string, number>(
      Object.entries(jsState.markings)
    ),
    tasks: HashMap.fromIterable<string, WTaskState>(
      Object.entries(jsState.tasks)
    ),
  });
}

function toJSState(interpreterState: InterpreterState): JSInterpreterState {
  return {
    markings: Object.fromEntries(interpreterState.markings),
    tasks: Object.fromEntries(interpreterState.tasks),
  };
}

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

  const res1 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.start()),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory())
    )
  );

  expect(toJSState(res1)).toEqual({
    markings: { start: 1 },
    tasks: { scan_goods: 'enabled' },
  });

  const res2 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.activateTask('scan_goods')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res1))
    )
  );

  expect(toJSState(res2)).toEqual({
    markings: {},
    tasks: { scan_goods: 'active' },
  });

  const res3 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.completeTask('scan_goods')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res2))
    )
  );

  expect(toJSState(res3)).toEqual({
    markings: { 'implicit:scan_goods->pay': 1 },
    tasks: { pay: 'enabled', scan_goods: 'completed' },
  });

  const res4 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.activateTask('pay')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res3))
    )
  );

  expect(toJSState(res4)).toEqual({
    markings: {},
    tasks: { pay: 'active', scan_goods: 'completed' },
  });

  const res5 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.completeTask('pay')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res4))
    )
  );

  expect(toJSState(res5)).toEqual({
    markings: {
      'implicit:pay->issue_receipt': 1,
      'implicit:pay->pack_goods': 1,
    },
    tasks: {
      pay: 'completed',
      pack_goods: 'enabled',
      scan_goods: 'completed',
      issue_receipt: 'enabled',
    },
  });

  const res6 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.activateTask('pack_goods')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res5))
    )
  );

  expect(toJSState(res6)).toEqual({
    markings: { 'implicit:pay->issue_receipt': 1 },
    tasks: {
      pay: 'completed',
      pack_goods: 'active',
      scan_goods: 'completed',
      issue_receipt: 'enabled',
    },
  });

  const res7 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.completeTask('pack_goods')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res6))
    )
  );

  expect(toJSState(res7)).toEqual({
    markings: {
      'implicit:pay->issue_receipt': 1,
      'implicit:pack_goods->check_goods': 1,
    },
    tasks: {
      pay: 'completed',
      pack_goods: 'completed',
      scan_goods: 'completed',
      issue_receipt: 'enabled',
    },
  });

  const res8 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) =>
        interpreter.activateTask('issue_receipt')
      ),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res7))
    )
  );

  expect(toJSState(res8)).toEqual({
    markings: { 'implicit:pack_goods->check_goods': 1 },
    tasks: {
      pay: 'completed',
      pack_goods: 'completed',
      scan_goods: 'completed',
      issue_receipt: 'active',
    },
  });

  const res9 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) =>
        interpreter.completeTask('issue_receipt')
      ),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res8))
    )
  );

  expect(toJSState(res9)).toEqual({
    markings: {
      'implicit:issue_receipt->check_goods': 1,
      'implicit:pack_goods->check_goods': 1,
    },
    tasks: {
      check_goods: 'enabled',
      pay: 'completed',
      pack_goods: 'completed',
      scan_goods: 'completed',
      issue_receipt: 'completed',
    },
  });

  const res10 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.activateTask('check_goods')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res9))
    )
  );

  expect(toJSState(res10)).toEqual({
    markings: {},
    tasks: {
      check_goods: 'active',
      pay: 'completed',
      pack_goods: 'completed',
      scan_goods: 'completed',
      issue_receipt: 'completed',
    },
  });

  const res11 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.completeTask('check_goods')),
      Effect.flatMap((interpreter) => interpreter.getState()),
      Effect.provideServiceEffect(StateManager, createMemory(res10))
    )
  );

  expect(toJSState(res11)).toEqual({
    markings: { end: 1 },
    tasks: {
      check_goods: 'completed',
      pay: 'completed',
      pack_goods: 'completed',
      scan_goods: 'completed',
      issue_receipt: 'completed',
    },
  });
});
