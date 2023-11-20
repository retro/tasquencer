import { Context, Effect } from 'effect';

export interface IdGenerator {
  next(
    type: 'workflow' | 'task' | 'condition'
  ): Effect.Effect<never, never, string>;
}
export const IdGenerator = Context.Tag<IdGenerator>();
