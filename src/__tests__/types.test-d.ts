import { Context, Data, Effect } from 'effect';
import { assertType, expect, it } from 'vitest';

/*import * as Builder from '../builder.js';
import {
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  TaskNotActiveError,
  TaskNotEnabledError,
  WorkflowNotInitialized,
} from '../errors.js';
import * as Interpreter from '../interpreter.js';
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
}*/

/*interface PredicateService {
  bar(baz: string): Effect.Effect<never, never, boolean>;
}
const PredicateService = Context.Tag<PredicateService>();

interface SomeError extends Data.Case {
  readonly _tag: 'SomeError';
}
const SomeError = Data.tagged<SomeError>('SomeError');

it('can correctly infer predicate types', () => {
  const workflowDefinition = Builder.workflow<{ foo: string }>('xor-join')
    .startCondition('start')
    .task('A', (t) => t.withSplitType('xor'))
    .task('B')
    .task('C')
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => {
      const to1 = to
        .task('B', ({ context }) =>
          Effect.gen(function* ($) {
            const predicateService = yield* $(PredicateService);
            if (Math.random() > 0.5) {
              yield* $(Effect.fail(SomeError()));
            }
            return yield* $(predicateService.bar(context.foo));
          })
        )
        .defaultTask('C');

      return to1;
    })
    .connectTask('C', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();
    const stateManager = yield* $(
      createMemory(),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const workflow = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter = yield* $(
      Interpreter.make(workflow, { foo: 'B' }),
      Effect.provideService(StateManager, stateManager)
    );

    const start = interpreter.start();

    assertType<
      Effect.Effect<
        PredicateService,
        | SomeError
        | TaskDoesNotExist
        | WorkflowNotInitialized
        | StartConditionDoesNotExist
        | EndConditionDoesNotExist
        | TaskNotEnabledError
        | TaskNotActiveError,
        void
      >
    >(start);

    //const fire = interpreter.fireTask('A');
    //const exit = interpreter.exitTask('A');
  });

  Effect.runSync(program);
});
*/

it('works', () => {
  expect(1).toBe(1);
});
