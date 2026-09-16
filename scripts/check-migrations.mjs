#!/usr/bin/env node
/**
 * Đối chiếu thư mục supabase/migrations với sổ migration trên database.
 *
 * Supabase nhớ "migration nào đã chạy" bằng CON SỐ timestamp, không phải bằng
 * tên. Khi ai đó áp migration ngoài `supabase db push` — bấm tay trên dashboard
 * hoặc chạy SQL trực tiếp — sổ ghi con số của thời điểm bấm chứ không phải con
 * số trong tên file. Cùng một migration, sổ một số, repo một số khác, và lần
 * `db push` kế tiếp sẽ chạy lại nó. Với migration không idempotent (create
 * table trần, insert không on conflict) thì đó là một lần deploy hỏng.
 *
 * Ngày 16/09/2026 đã có 20 migration lệch kiểu này cùng lúc. Script tồn tại để
 * chỗ lệch đó kêu lên ngay, thay vì im cho tới lần push sau.
 *
 * Đặt SUPABASE_DB_URL rồi chạy `npm run check:migrations`. Chỉ đọc, không ghi.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** Tên file chuẩn là <14 chữ số>_<tên>.sql. */
const FILENAME = /^(\d{14})_(.+)\.sql$/;

/**
 * Đọc thư mục migration thành Map<version, name>, kèm danh sách tên file sai dạng.
 *
 * @param {string} dir
 */
export function readMigrationDir(dir) {
  /** @type {Map<string, string>} */
  const repo = new Map();
  /** @type {string[]} */
  const malformed = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".sql")) continue;
    const match = FILENAME.exec(file);
    if (match) repo.set(match[1], match[2]);
    else malformed.push(file);
  }
  return { repo, malformed };
}

/**
 * So repo với sổ. Thuần, không IO, để kiểm thử được.
 *
 * `renamed` là hạng mục quan trọng nhất và dễ xử lý sai nhất: cùng tên nhưng
 * khác số nghĩa là migration ĐÃ chạy rồi, chỉ ghi sai số. Cách sửa là cập nhật
 * số trong sổ cho khớp tên file. Chạy lại SQL là sai, và với migration không
 * idempotent thì là hỏng.
 *
 * @param {{
 *   repo: Map<string, string>,
 *   ledger: Map<string, string>,
 *   malformed?: string[],
 * }} input
 */
export function compareMigrations({ repo, ledger, malformed = [] }) {
  /** @type {Map<string, string>} */
  const ledgerByName = new Map();
  for (const [version, name] of ledger) if (name) ledgerByName.set(name, version);

  const absent = [...repo.keys()].filter((version) => !ledger.has(version));
  /** @type {{ name: string, was: string, version: string }[]} */
  const renamed = [];
  /** @type {string[]} */
  const missing = [];
  for (const version of absent) {
    const name = repo.get(version);
    const was = ledgerByName.get(name);
    if (was !== undefined) renamed.push({ name, was, version });
    else missing.push(version);
  }
  const extra = [...ledger.keys()].filter((version) => !repo.has(version));

  const problems = [];
  if (malformed.length)
    problems.push(`Tên file không đúng dạng <timestamp>_<tên>.sql:\n  ${malformed.join("\n  ")}`);
  if (renamed.length)
    problems.push(
      "Đã chạy nhưng ghi sai số (SỬA SỔ, ĐỪNG CHẠY LẠI):\n" +
        renamed.map((r) => `  ${r.name}: sổ ghi ${r.was}, file là ${r.version}`).join("\n"),
    );
  if (missing.length)
    problems.push(
      "Có trong repo, chưa có trong sổ (cần áp):\n" +
        missing.map((v) => `  ${v}_${repo.get(v)}`).join("\n"),
    );
  if (extra.length)
    problems.push(
      "Có trong sổ, không có file tương ứng:\n" +
        extra.map((v) => `  ${v} ${ledger.get(v)}`).join("\n"),
    );

  return { renamed, missing, extra, malformed, problems };
}

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.log(
      "Bỏ qua đối chiếu migration: chưa đặt SUPABASE_DB_URL.\n" +
        "Đặt biến này trỏ tới database cần kiểm rồi chạy lại `npm run check:migrations`.",
    );
    return 0;
  }

  const { repo, malformed } = readMigrationDir(
    path.join(import.meta.dirname, "..", "supabase", "migrations"),
  );

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let rows;
  try {
    ({ rows } = await client.query(
      "select version, name from supabase_migrations.schema_migrations order by version",
    ));
  } finally {
    await client.end();
  }

  const ledger = new Map(rows.map((row) => [row.version, row.name ?? ""]));
  const { problems } = compareMigrations({ repo, ledger, malformed });
  if (!problems.length) {
    console.log(`Sổ migration khớp repo: ${repo.size} file, ${ledger.size} dòng, lệch 0.`);
    return 0;
  }
  console.error(problems.join("\n\n"));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(await main());
