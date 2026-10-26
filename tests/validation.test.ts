import { describe, expect, it } from "vitest";
import { usernamesMatch, validateUsername } from "../lib/validation";

describe("demo username validation", () => {
  it("accepts a practical username", () => expect(validateUsername("Asha Rao")).toBeNull());
  it("rejects unsupported characters", () => expect(validateUsername("asha@home")).toMatch(/letters/i));
  it("matches usernames with exact casing", () => {
    expect(usernamesMatch("AshaRao", "AshaRao")).toBe(true);
    expect(usernamesMatch("AshaRao", "asharao")).toBe(false);
  });
});

