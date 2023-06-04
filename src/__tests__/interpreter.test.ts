import { pipe } from '@effect/data/Function';
import * as Either from '@effect/data/either';
import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import { Builder } from '../index.js';
import { Interpreter, makeInterpreter } from '../interpreter2.js';

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
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res1).toEqual({
    markings: { start: 1 },
    enabledTasks: new Set(['scan_goods']),
    activeTasks: new Set(),
  });

  const res2 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res1)),
      Effect.flatMap((interpreter) => interpreter.activateTask('scan_goods')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res2).toEqual({
    markings: {},
    enabledTasks: new Set(),
    activeTasks: new Set(['scan_goods']),
  });

  const res3 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res2)),
      Effect.flatMap((interpreter) => interpreter.completeTask('scan_goods')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res3).toEqual({
    markings: { 'implicit:scan_goods->pay': 1 },
    enabledTasks: new Set(['pay']),
    activeTasks: new Set(),
  });

  const res4 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res3)),
      Effect.flatMap((interpreter) => interpreter.activateTask('pay')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res4).toEqual({
    markings: {},
    enabledTasks: new Set(),
    activeTasks: new Set(['pay']),
  });

  const res5 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res4)),
      Effect.flatMap((interpreter) => interpreter.completeTask('pay')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res5).toEqual({
    markings: {
      'implicit:pay->issue_receipt': 1,
      'implicit:pay->pack_goods': 1,
    },
    enabledTasks: new Set(['pack_goods', 'issue_receipt']),
    activeTasks: new Set(),
  });

  const res6 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res5)),
      Effect.flatMap((interpreter) => interpreter.activateTask('pack_goods')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res6).toEqual({
    markings: { 'implicit:pay->issue_receipt': 1 },
    enabledTasks: new Set(['issue_receipt']),
    activeTasks: new Set(['pack_goods']),
  });

  const res7 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res6)),
      Effect.flatMap((interpreter) => interpreter.completeTask('pack_goods')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res7).toEqual({
    markings: {
      'implicit:pay->issue_receipt': 1,
      'implicit:pack_goods->check_goods': 1,
    },
    enabledTasks: new Set(['issue_receipt']),
    activeTasks: new Set(),
  });

  const res8 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res7)),
      Effect.flatMap((interpreter) =>
        interpreter.activateTask('issue_receipt')
      ),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res8).toEqual({
    markings: {
      'implicit:pack_goods->check_goods': 1,
    },
    enabledTasks: new Set(),
    activeTasks: new Set(['issue_receipt']),
  });

  const res9 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res8)),
      Effect.flatMap((interpreter) =>
        interpreter.completeTask('issue_receipt')
      ),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res9).toEqual({
    markings: {
      'implicit:issue_receipt->check_goods': 1,
      'implicit:pack_goods->check_goods': 1,
    },
    enabledTasks: new Set(['check_goods']),
    activeTasks: new Set(),
  });

  const res10 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res9)),
      Effect.flatMap((interpreter) => interpreter.activateTask('check_goods')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res10).toEqual({
    markings: {},
    enabledTasks: new Set(),
    activeTasks: new Set(['check_goods']),
  });

  const res11 = Effect.runSync(
    pipe(
      makeInterpreter(net),
      Effect.flatMap((interpreter) => interpreter.resumeFromJSState(res10)),
      Effect.flatMap((interpreter) => interpreter.completeTask('check_goods')),
      Effect.flatMap((interpreter) => interpreter.getJSState())
    )
  );

  expect(res11).toEqual({
    markings: { end: 1 },
    enabledTasks: new Set(),
    activeTasks: new Set(),
  });
});
