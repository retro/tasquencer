import util from "node:util";
import { Builder } from "./builder.js";

export function foo() {
  return "a";
}

const builder = new Builder<{ foo?: string }>();

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

/*console.log(
  util.inspect(net, { showHidden: false, depth: null, colors: true })
);

console.log(net.toDot());*/

const interpreter = net.buildInterpreter({ foo: "bar" }).start();

/*console.log(
  util.inspect(interpreter, { showHidden: false, depth: null, colors: true })
);*/
