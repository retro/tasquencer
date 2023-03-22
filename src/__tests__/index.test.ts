import { expect, it } from "vitest";
import { foo } from "../index.js";
it("foo", () => {
  expect(foo()).toEqual("a");
});
