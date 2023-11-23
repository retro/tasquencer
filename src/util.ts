import { Effect } from 'effect';
import { nanoid } from 'nanoid';

import { IdGenerator, WorkItemId, WorkflowInstanceId } from './types.js';

export const nanoidIdGenerator: IdGenerator = {
  workflow: () => Effect.succeed(WorkflowInstanceId(nanoid())),
  workItem: () => Effect.succeed(WorkItemId(nanoid())),
};
