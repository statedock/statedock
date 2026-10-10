import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actorSchema, fileSchema, planStatuses } from "./index.js";

describe("core schemas", () => {
  it("defines the goal lifecycle states", () =>
    assert.deepEqual(planStatuses, ["PLAN", "WORKING", "WAITING", "DONE", "DROPPED"]));
  it("defaults actors to human", () =>
    assert.equal(actorSchema.parse({ id: "jason" }).type, "human"));
  it("rejects traversal in project file paths", () =>
    assert.equal(fileSchema.safeParse({ path: "../secret.md", content: "x" }).success, false));
  it("resolves natural scoped plan locators", async () => {
    const mockRepo: any = {
      getPlan: async (key: string, num: number) => ({
        id: "1",
        projectId: "p1",
        number: num,
        reference: `SD-${num}`,
        title: "Test",
        body: "",
        summary: null,
        status: "WORKING",
        createdAt: "",
        updatedAt: "",
      }),
      getPlanByGlobalNumber: async (n: number) => ({
        id: "1",
        projectId: "p1",
        number: n,
        reference: `SD-${n}`,
        title: "Test",
        body: "",
        summary: null,
        status: "WORKING",
        createdAt: "",
        updatedAt: "",
      }),
      getPlanById: async () => {
        throw new Error("not found");
      },
    };
    const { StateDockService } = await import("./service.js");
    const svc = new StateDockService(mockRepo);
    const p1 = await svc.resolvePlan({ reference: "statedock-11" });
    assert.equal(p1.number, 11);
    const p2 = await svc.resolvePlan({ reference: "statedock11" });
    assert.equal(p2.number, 11);
    const p3 = await svc.resolvePlan({ reference: "statedock#11" });
    assert.equal(p3.number, 11);
    const p4 = await svc.resolvePlan({ reference: "SD-11" });
    assert.equal(p4.number, 11);
    const p5 = await svc.resolvePlan({ reference: "SD-000011" });
    assert.equal(p5.number, 11);
  });
});
