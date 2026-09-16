import { describe, expect, it } from "vitest";
import {
  compareMigrations,
  readMigrationDir,
} from "../../scripts/check-migrations.mjs";

const dir = new URL("../../supabase/migrations", import.meta.url).pathname;

/** Dựng một sổ khớp hoàn toàn với danh sách file truyền vào. */
const ledgerOf = (repo: Map<string, string>) => new Map(repo);

describe("compareMigrations", () => {
  const repo = new Map([
    ["20260101000000", "first"],
    ["20260102000000", "second"],
  ]);

  it("không báo gì khi sổ khớp repo", () => {
    expect(compareMigrations({ repo, ledger: ledgerOf(repo) }).problems).toEqual([]);
  });

  // Đây là ca đã xảy ra thật: migration áp ngoài `db push` nên sổ ghi con số
  // của lúc bấm. Gọi nó là "chưa chạy" sẽ dẫn tới chạy lại và hỏng deploy.
  it("gọi cùng-tên-khác-số là ghi sai số, không phải chưa chạy", () => {
    const ledger = new Map([
      ["20260101000000", "first"],
      ["20260102003344", "second"],
    ]);
    const result = compareMigrations({ repo, ledger });
    expect(result.renamed).toEqual([
      { name: "second", was: "20260102003344", version: "20260102000000" },
    ]);
    expect(result.missing).toEqual([]);
    expect(result.problems.join("\n")).toContain("ĐỪNG CHẠY LẠI");
  });

  it("báo migration thật sự chưa áp", () => {
    const ledger = new Map([["20260101000000", "first"]]);
    const result = compareMigrations({ repo, ledger });
    expect(result.missing).toEqual(["20260102000000"]);
    expect(result.renamed).toEqual([]);
  });

  it("báo dòng trong sổ không còn file tương ứng", () => {
    const ledger = new Map([...repo, ["20260103000000", "vanished"]]);
    expect(compareMigrations({ repo, ledger }).extra).toEqual(["20260103000000"]);
  });

  // Một dòng sổ không có tên (ví dụ được ghi nhận bằng tay) thì không thể dùng
  // để nhận ra ca ghi sai số — nó phải rơi vào "chưa áp", không được im lặng.
  it("không ghép tên rỗng", () => {
    const ledger = new Map([
      ["20260101000000", "first"],
      ["20260102003344", ""],
    ]);
    const result = compareMigrations({ repo, ledger });
    expect(result.renamed).toEqual([]);
    expect(result.missing).toEqual(["20260102000000"]);
  });

  it("báo tên file sai dạng", () => {
    const result = compareMigrations({
      repo,
      ledger: ledgerOf(repo),
      malformed: ["fix.sql"],
    });
    expect(result.problems.join("\n")).toContain("fix.sql");
  });
});

describe("readMigrationDir", () => {
  it("đọc được thư mục migration thật và không có tên nào sai dạng", () => {
    const { repo, malformed } = readMigrationDir(dir);
    expect(malformed).toEqual([]);
    expect(repo.size).toBeGreaterThan(80);
    for (const version of repo.keys()) expect(version).toMatch(/^\d{14}$/);
  });
});
