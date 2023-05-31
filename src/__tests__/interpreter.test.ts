import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import { Builder } from '../index.js';
import { makeInterpreter } from '../interpreter2.js';

it('a', () => {
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

  const program = pipe(
    makeInterpreter(net),
    Effect.flatMap((interpreter) => interpreter.start()),
    Effect.flatMap((interpreter) => interpreter.activateTask('scan_goods')),
    Effect.flatMap((interpreter) => interpreter.completeTask('scan_goods')),
    Effect.flatMap((interpreter) => interpreter.getState()),
    Effect.tap((state) =>
      Effect.succeed(console.log('>>', JSON.stringify(state)))
    )
  );

  const res = Effect.runSync(program);

  console.log('>>', res);

  expect(false).toBe(true);

  // console.log('>>', Effect.runSync(interpreter.start()));
});
