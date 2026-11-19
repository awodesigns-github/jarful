import { describe, expect, it } from "vitest";
import { resolveRedirect } from "../../convex/auth";

const site = "https://jarful.example";

describe("resolveRedirect", () => {
  it("accepts the app's own scheme everywhere", () => {
    expect(resolveRedirect("jarful://auth-callback", { site, allowExpoGo: false })).toBe("jarful://auth-callback");
  });
  it("rejects exp:// unless Expo Go is allowed", () => {
    expect(() => resolveRedirect("exp://192.168.1.2:8081/--/auth-callback", { site, allowExpoGo: false })).toThrow();
    expect(resolveRedirect("exp://192.168.1.2:8081/--/auth-callback", { site, allowExpoGo: true })).toBe(
      "exp://192.168.1.2:8081/--/auth-callback",
    );
  });
  it("accepts the site and relative paths, rejects other hosts", () => {
    expect(resolveRedirect(`${site}/done`, { site, allowExpoGo: false })).toBe(`${site}/done`);
    expect(resolveRedirect("/done", { site, allowExpoGo: false })).toBe(`${site}/done`);
    expect(() => resolveRedirect("https://evil.example/done", { site, allowExpoGo: false })).toThrow();
    expect(() => resolveRedirect(`${site}.evil.example`, { site, allowExpoGo: false })).toThrow();
  });
});
