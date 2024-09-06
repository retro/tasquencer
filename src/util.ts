import { Context, Effect } from 'effect';
import { nanoid } from 'nanoid';

import { IdGenerator, WorkItemId, WorkflowId } from './types.js';

export const nanoidIdGenerator: Context.Tag.Service<IdGenerator> = {
  workflow: () => Effect.succeed(WorkflowId(nanoid())),
  workItem: () => Effect.succeed(WorkItemId(nanoid())),
};
