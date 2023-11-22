import { Effect } from 'effect';

import {
  WorkItemGetInitialPayloadsPayload,
  WorkItemHandlers,
  WorkItemOnCreatePayload,
} from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkItemPayload<T> = T extends WorkItemBuilder<any, infer P> ? P : never;

/* eslint-disable @typescript-eslint/no-explicit-any */
type WorkItemBuilderHandlerReturnTypes<T> = T extends WorkItemBuilder<
  any,
  any,
  infer HRT
>
  ? HRT
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ValidWorkItemBuilder<
  T extends WorkItemBuilder<any, any>,
  P = WorkItemPayload<T>,
  HRT extends HandlerReturnTypes = WorkItemBuilderHandlerReturnTypes<T>
> = P extends never
  ? never
  : HRT extends never
  ? never
  : HRT['onCreate'] extends P
  ? HRT['getInitialPayloads'] extends P[]
    ? T
    : never
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerFnReturning<S> = (...args: any[]) => Effect.Effect<any, any, S>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkItemBuilderR<T> = T extends WorkItemBuilder<
  any,
  any,
  any,
  infer R
>
  ? R
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkItemBuilderE<T> = T extends WorkItemBuilder<
  any,
  any,
  any,
  any,
  infer E
>
  ? E
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface HandlerReturnTypes {
  getInitialPayloads: unknown[];
  onCreate: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkItemBuilder = WorkItemBuilder<any, any>;

export class WorkItemBuilder<
  C extends object,
  P extends object | null = null,
  HRT extends HandlerReturnTypes = HandlerReturnTypes,
  R = never,
  E = never
> {
  private handlers: WorkItemHandlers<C, P> = {
    initialPayloads: () => Effect.succeed([]),
    createPayload: () => Effect.succeed(null as P),
  } as WorkItemHandlers<C, P>;

  initialPayloads<R1, E1, A>(
    handler: ((
      payload: WorkItemGetInitialPayloadsPayload<C, P>
    ) => Effect.Effect<R1, E1, A>) &
      HandlerFnReturning<P[]>
  ): WorkItemBuilder<C, P, HRT & { getInitialPayloads: A }, R | R1, E | E1> {
    this.handlers.initialPayloads = handler;
    return this;
  }
  createPayload<R1, E1, A>(
    handler: ((
      payload: WorkItemOnCreatePayload<C, P>,
      input: unknown
    ) => Effect.Effect<R1, E1, A>) &
      HandlerFnReturning<P>
  ): WorkItemBuilder<C, P, HRT & { onCreate: A }, R | R1, E | E1> {
    this.handlers.createPayload = handler;
    return this;
  }
  build() {
    return this.handlers;
  }
}

export function workItem<
  C extends object = object,
  P extends object | null = null
>() {
  return new WorkItemBuilder<C, P>();
}
