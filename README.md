# Tasquencer

A BPM library for Node based on the concepts from https://yawlfoundation.github.io/.

- Implemented with a "code-first" approach
- Minimal - implements only the flow control concepts, everything else should be implemented in user space code

Example:

```typescript
const workflowDefinition = Builder.workflow<{
  shouldBookFlight: boolean;
  shouldBookCar: boolean;
}>()
  .withName('or-split-join')
  .startCondition('start')
  .task('register', Builder.emptyTask().withSplitType('or'))
  .task('book_flight', Builder.emptyTask())
  .task('book_hotel', Builder.emptyTask())
  .task('book_car', Builder.emptyTask())
  .task('pay', Builder.emptyTask().withJoinType('or'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('register'))
  .connectTask('register', (to) =>
    to
      .task('book_flight', ({ context }) =>
        Effect.succeed(context.shouldBookFlight)
      )
      .task('book_car', ({ context }) => Effect.succeed(context.shouldBookCar))
      .defaultTask('book_hotel')
  )
  .connectTask('book_flight', (to) => to.task('pay'))
  .connectTask('book_hotel', (to) => to.task('pay'))
  .connectTask('book_car', (to) => to.task('pay'))
  .connectTask('pay', (to) => to.condition('end'));
```

Still very much a work in progress, but public API is stable.
