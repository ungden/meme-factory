#!/usr/bin/env node
/**
 * Chạy các kiểm thử SQL trong scripts/tests/ bên trong một transaction bị
 * rollback. Chúng cần một Postgres thật nên không nằm trong `npm test`; đây là
 * cổng trước khi phát hành.
 *
 * Đặt SUPABASE_DB_URL trỏ tới một database DÙNG ĐỂ KIỂM THỬ. Không chạy trên
 * production: script mở transaction rồi rollback, nhưng nó vẫn đọc và ghi tạm
 * lên dữ liệu thật.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.log(
    "Bỏ qua kiểm thử SQL: chưa đặt SUPABASE_DB_URL.\n" +
      "Đặt biến này trỏ tới database kiểm thử rồi chạy lại `npm run test:sql`.",
  );
  process.exit(0);
}

const dir = path.join(import.meta.dirname, "tests");
const only = process.argv[2];
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => !only || name.includes(only))
  .sort();

if (!files.length) {
  console.error(only ? `Không có kiểm thử SQL nào khớp "${only}".` : "Không tìm thấy kiểm thử SQL.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
let failed = 0;
for (const file of files) {
  // Mỗi tệp chạy trong transaction riêng và luôn bị rollback, nên không bản ghi
  // hay khoản điểm nào của QA còn sót lại.
  try {
    await client.query("begin");
    await client.query(readFileSync(path.join(dir, file), "utf8"));
    console.log(`  ok  ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${file}\n      ${error.message}`);
  } finally {
    await client.query("rollback").catch(() => {});
  }
}
await client.end();
console.log(`\n${files.length - failed}/${files.length} kiểm thử SQL đạt.`);
process.exit(failed ? 1 : 0);
