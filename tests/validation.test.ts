import { describe, expect, it } from "vitest";
import { emailPattern, validateSignup } from "../lib/validation";

describe("authentication validation", () => {
  it("accepts a valid email", () => expect(emailPattern.test("user@example.com")).toBe(true));
  it("rejects malformed email", () => expect(emailPattern.test("invalid-email")).toBe(false));
  it("enforces password complexity", () => expect(validateSignup({ fullName: "Test User", email: "user@example.com", password: "weakpass", confirmPassword: "weakpass" })).toContain("uppercase"));
  it("requires matching passwords", () => expect(validateSignup({ fullName: "Test User", email: "user@example.com", password: "Secure123", confirmPassword: "Secure124" })).toBe("Passwords do not match."));
  it("accepts a valid signup", () => expect(validateSignup({ fullName: "Test User", email: "user@example.com", password: "Secure123", confirmPassword: "Secure123" })).toBeNull());
});
