import { expect, it } from "vitest";
import { Builder } from "../builder.js";

it("can run simple net with and-split and and-join", () => {
  const builder = new Builder<null>();

  const net = builder
    .addStartCondition("start")
    .addEndCondition("end")
    .addTask("scan_goods", {})
    .addTask("pay", { splitType: "and" })
    .addTask("pack_goods", {})
    .addTask("issue_receipt", {})
    .addTask("check_goods", { joinType: "and" })
    .connectConditionToTask("start", "scan_goods")
    .connectTaskToTask("scan_goods", "pay")
    .connectTaskToTask("pay", "pack_goods")
    .connectTaskToTask("pay", "issue_receipt")
    .connectTaskToTask("pack_goods", "check_goods")
    .connectTaskToTask("issue_receipt", "check_goods")
    .connectTaskToCondition("check_goods", "end");

  const interpreter = net.buildInterpreter(null);

  interpreter.start();

  interpreter.activateTask("scan_goods");
  expect(interpreter.getMarkings()).toMatchObject({});
  expect(interpreter.getActiveTasks()).toMatchObject(new Set(["scan_goods"]));
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("scan_goods");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["pay"]));

  interpreter.activateTask("pay");
  expect(interpreter.getActiveTasks()).toMatchObject(new Set(["pay"]));
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("pay");
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["pack_goods", "issue_receipt"])
  );

  interpreter.activateTask("pack_goods");
  expect(interpreter.getActiveTasks()).toMatchObject(new Set(["pack_goods"]));
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["issue_receipt"])
  );

  interpreter.activateTask("issue_receipt");
  expect(interpreter.getActiveTasks()).toMatchObject(
    new Set(["pack_goods", "issue_receipt"])
  );
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("pack_goods");
  expect(interpreter.getActiveTasks()).toMatchObject(
    new Set(["issue_receipt"])
  );
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("issue_receipt");
  expect(interpreter.getActiveTasks()).toMatchObject(new Set());
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["check_goods"]));

  interpreter.activateTask("check_goods");
  expect(interpreter.getActiveTasks()).toMatchObject(new Set(["check_goods"]));
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("check_goods");
  expect(interpreter.getActiveTasks()).toMatchObject(new Set());
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());
  expect(interpreter.getMarkings()).toMatchObject({ end: 1 });
});

it("supports deferred choice pattern", () => {
  const builder = new Builder<null>();

  const net = builder
    .addStartCondition("start")
    .addEndCondition("end")
    .addTask("task_1", {})
    .addTask("task_1a", {})
    .addTask("task_2", {})
    .addTask("task_2a", {})
    .connectConditionToTask("start", "task_1")
    .connectConditionToTask("start", "task_2")
    .connectTaskToTask("task_1", "task_1a")
    .connectTaskToTask("task_2", "task_2a")
    .connectTaskToCondition("task_1a", "end")
    .connectTaskToCondition("task_2a", "end");

  const interpreter = net.buildInterpreter(null);

  interpreter.start();
  expect(interpreter.getMarkings()).toMatchObject({ start: 1 });
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["task_1", "task_2"])
  );

  interpreter.activateTask("task_1").completeTask("task_1");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["task_1a"]));

  interpreter.activateTask("task_1a").completeTask("task_1a");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());
  expect(interpreter.getMarkings()).toMatchObject({ end: 1 });
});

it("supports xor join", () => {
  const builder = new Builder<null>();

  const net = builder
    .addStartCondition("start")
    .addEndCondition("end")
    .addTask("initial_task", {})
    .addCondition("choice")
    .addTask("finish_task", { joinType: "xor" })
    .addTask("task_a", {})
    .addTask("task_b", {})
    .addTask("task_c", {})
    .connectTaskToCondition("initial_task", "choice")
    .connectConditionToTask("choice", "task_a")
    .connectConditionToTask("choice", "task_b")
    .connectConditionToTask("choice", "task_c")
    .connectTaskToTask("task_a", "finish_task")
    .connectTaskToTask("task_b", "finish_task")
    .connectTaskToTask("task_c", "finish_task")
    .connectConditionToTask("start", "initial_task")
    .connectTaskToCondition("finish_task", "end");

  const interpreter = net.buildInterpreter(null);

  interpreter.start();
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["initial_task"])
  );

  interpreter.activateTask("initial_task").completeTask("initial_task");
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["task_a", "task_b", "task_c"])
  );

  interpreter.activateTask("task_b").completeTask("task_b");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["finish_task"]));
});

it("supports interleaved parallel routing pattern", () => {
  const builder = new Builder<null>();

  const net = builder
    .addStartCondition("start")
    .addEndCondition("end")
    .addCondition("mutex")
    .addTask("initial_task", {})
    .addTask("finish_task", { joinType: "and" })
    .addTask("task_a", { joinType: "and", splitType: "and" })
    .addTask("task_b", { joinType: "and", splitType: "and" })
    .addTask("task_c", { joinType: "and", splitType: "and" })
    .addTask("task_d", { joinType: "and", splitType: "and" })
    .connectTaskToCondition("initial_task", "mutex")
    .connectConditionToTask("start", "initial_task")
    .connectTaskToTask("initial_task", "task_a")
    .connectTaskToTask("initial_task", "task_c")
    .connectTaskToCondition("task_a", "mutex")
    .connectConditionToTask("mutex", "task_a")
    .connectTaskToTask("task_a", "task_b")
    .connectTaskToCondition("task_b", "mutex")
    .connectConditionToTask("mutex", "task_b")
    .connectTaskToCondition("task_c", "mutex")
    .connectConditionToTask("mutex", "task_c")
    .connectTaskToTask("task_c", "task_d")
    .connectTaskToCondition("task_d", "mutex")
    .connectConditionToTask("mutex", "task_d")
    .connectTaskToTask("task_b", "finish_task")
    .connectTaskToTask("task_d", "finish_task")
    .connectTaskToCondition("finish_task", "end");

  const interpreter = net.buildInterpreter(null);

  interpreter.start();
  interpreter.activateTask("initial_task").completeTask("initial_task");
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["task_a", "task_c"])
  );

  interpreter.activateTask("task_a");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("task_a");
  expect(interpreter.getEnabledTasks()).toMatchObject(
    new Set(["task_c", "task_b"])
  );

  interpreter.activateTask("task_b");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("task_b");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["task_c"]));

  interpreter.activateTask("task_c");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("task_c");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["task_d"]));

  interpreter.activateTask("task_d");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());

  interpreter.completeTask("task_d");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set(["finish_task"]));

  interpreter.activateTask("finish_task").completeTask("finish_task");
  expect(interpreter.getEnabledTasks()).toMatchObject(new Set());
  expect(interpreter.getMarkings()).toMatchObject({ end: 1 });
});

it("can handle xor join", () => {
  const builder = new Builder<{ foo: string }>();

  const net = builder
    .addStartCondition("start")
    .addEndCondition("end")
    .addTask("A", { splitType: "xor" })
    .addTask("B", {})
    .addTask("C", {})
    .addTask("D", {})
    .connectConditionToTask("start", "A")
    .connectTaskToTask("A", "B", {
      order: 1,
      predicate: ({ foo }) => {
        return foo === "B";
      },
    })
    .connectTaskToTask("A", "C", {
      order: 2,
      predicate: ({ foo }) => {
        return foo === "C";
      },
    })
    .connectTaskToTask("A", "D", {
      isDefault: true,
    })
    .connectTaskToCondition("B", "end")
    .connectTaskToCondition("C", "end")
    .connectTaskToCondition("D", "end");

  const interpreter1 = net.buildInterpreter({ foo: "B" });

  interpreter1.start().activateTask("A").completeTask("A");

  expect(interpreter1.getEnabledTasks()).toMatchObject(new Set(["B"]));

  const interpreter2 = net.buildInterpreter({ foo: "C" });

  interpreter2.start().activateTask("A").completeTask("A");

  expect(interpreter2.getEnabledTasks()).toMatchObject(new Set(["C"]));

  const interpreter3 = net.buildInterpreter({ foo: "not a match" });

  interpreter3.start().activateTask("A").completeTask("A");

  expect(interpreter3.getEnabledTasks()).toMatchObject(new Set(["D"]));
});

it("can run a net with or-split and or-join", () => {
  const builder = new Builder<{
    shouldBookFlight: boolean;
    shouldBookHotel: boolean;
    shouldBookCar: boolean;
  }>();

  const net = builder
    .addStartCondition("start")
    .addEndCondition("end")
    .addTask("register", { splitType: "or" })
    .addTask("book_flight", {})
    .addTask("book_hotel", {})
    .addTask("book_car", {})
    .addTask("pay", { joinType: "or" })
    .connectConditionToTask("start", "register")
    .connectTaskToTask("register", "book_flight", {
      order: 1,
      predicate: ({ shouldBookFlight }) => shouldBookFlight,
    })
    .connectTaskToTask("register", "book_hotel", {
      isDefault: true,
    })
    .connectTaskToTask("register", "book_car", {
      order: 2,
      predicate: ({ shouldBookCar }) => shouldBookCar,
    })
    .connectTaskToTask("book_flight", "pay")
    .connectTaskToTask("book_hotel", "pay")
    .connectTaskToTask("book_car", "pay")
    .connectTaskToCondition("pay", "end");

  const interpreter1 = net.buildInterpreter({
    shouldBookCar: true,
    shouldBookFlight: true,
    shouldBookHotel: true,
  });

  interpreter1.start();

  interpreter1.activateTask("register").completeTask("register");
  expect(interpreter1.getEnabledTasks()).toMatchObject(
    new Set(["book_flight", "book_hotel", "book_car"])
  );

  interpreter1.activateTask("book_flight").completeTask("book_flight");
  expect(interpreter1.getEnabledTasks()).toMatchObject(
    new Set(["book_hotel", "book_car"])
  );

  interpreter1.activateTask("book_hotel").completeTask("book_hotel");
  expect(interpreter1.getEnabledTasks()).toMatchObject(new Set(["book_car"]));

  interpreter1.activateTask("book_car").completeTask("book_car");
  expect(interpreter1.getEnabledTasks()).toMatchObject(new Set(["pay"]));

  const interpreter2 = net.buildInterpreter({
    shouldBookCar: false,
    shouldBookFlight: true,
    shouldBookHotel: true,
  });

  interpreter2.start();

  interpreter2.activateTask("register").completeTask("register");
  expect(interpreter2.getEnabledTasks()).toMatchObject(
    new Set(["book_flight", "book_hotel"])
  );

  interpreter2.activateTask("book_flight").completeTask("book_flight");
  expect(interpreter2.getEnabledTasks()).toMatchObject(new Set(["book_hotel"]));

  interpreter2.activateTask("book_hotel").completeTask("book_hotel");
  expect(interpreter2.getEnabledTasks()).toMatchObject(new Set(["pay"]));

  const interpreter3 = net.buildInterpreter({
    shouldBookCar: false,
    shouldBookFlight: false,
    shouldBookHotel: true,
  });

  interpreter3.start();

  interpreter3.activateTask("register").completeTask("register");
  expect(interpreter3.getEnabledTasks()).toMatchObject(new Set(["book_hotel"]));

  interpreter3.activateTask("book_hotel").completeTask("book_hotel");
  expect(interpreter3.getEnabledTasks()).toMatchObject(new Set(["pay"]));
});
