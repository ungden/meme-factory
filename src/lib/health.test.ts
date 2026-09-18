import { describe, expect, it } from "vitest";
import { healthReport, missingEnv, workerCheck } from "./health";

describe("missingEnv", () => {
  it("coi giá trị rỗng và giá trị giả là thiếu", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "  ",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    };
    expect(missingEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"])).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("không báo thiếu khi đủ", () => {
    expect(missingEnv({ A: "1", B: "2" }, ["A", "B"])).toEqual([]);
  });
});

describe("workerCheck", () => {
  const now = Date.parse("2026-09-18T10:00:00.000Z");

  it("sống khi vừa báo về", () => {
    expect(workerCheck("2026-09-18T09:58:00.000Z", now)).toEqual({
      name: "worker",
      ok: true,
      detail: "120s trước",
    });
  });

  it("chết khi quá ngưỡng", () => {
    expect(workerCheck("2026-09-18T09:50:00.000Z", now).ok).toBe(false);
  });

  it("chết khi chưa từng báo về hoặc mốc hỏng", () => {
    expect(workerCheck(null, now).ok).toBe(false);
    expect(workerCheck("hôm qua", now).ok).toBe(false);
  });
});

describe("healthReport", () => {
  it("200 khi mọi mục xanh, 503 khi có mục đỏ", () => {
    expect(healthReport([{ name: "config", ok: true }]).status).toBe(200);
    expect(healthReport([{ name: "config", ok: true }, { name: "database", ok: false }]).status).toBe(503);
  });
});
