import { describe, expect, it } from "vitest";
import { usesFatherTerminology, voicesLocked } from "./channel-behaviour";
import type { ChannelProfile } from "./family-catalogue";

const profile = (extra: Partial<ChannelProfile> = {}): ChannelProfile => ({
  version: 1,
  positioning: "",
  audience: "",
  tone: "",
  roles: [],
  series: [],
  avoid: [],
  references: [],
  ...extra,
});

describe("voicesLocked", () => {
  it("bật theo cờ trong hồ sơ kênh, không theo tên dự án", () => {
    expect(voicesLocked(profile({ voicesLocked: true }))).toBe(true);
    expect(voicesLocked(profile())).toBe(false);
    expect(voicesLocked(null)).toBe(false);
  });
});

describe("usesFatherTerminology", () => {
  it("chỉ bật với đúng quy tắc đã khai", () => {
    expect(usesFatherTerminology(profile({ terminologyRules: "family-father" }))).toBe(true);
    expect(usesFatherTerminology(profile())).toBe(false);
    expect(usesFatherTerminology(undefined)).toBe(false);
  });
});
