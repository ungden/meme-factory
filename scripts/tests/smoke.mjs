import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, evaluate } from "../smoke.mjs";

test("evaluate bắt sai mã trạng thái", () => {
  const check = { path: "/", status: [200], contains: null };
  assert.equal(evaluate(check, { status: 200, body: "" }), null);
  assert.match(evaluate(check, { status: 500, body: "" }), /mã 500/);
});

test("evaluate bắt trang trả đúng mã nhưng sai nội dung", () => {
  const check = { path: "/pricing", status: [200], contains: "điểm" };
  assert.equal(evaluate(check, { status: 200, body: "1 điểm = 500đ" }), null);
  assert.match(evaluate(check, { status: 200, body: "Trang đang bảo trì" }), /không thấy/);
});

test("chấp nhận nhiều mã cho cùng một mục", () => {
  const check = { path: "/api/internal/x", status: [401, 405], contains: null };
  assert.equal(evaluate(check, { status: 401, body: "" }), null);
  assert.equal(evaluate(check, { status: 405, body: "" }), null);
  assert.match(evaluate(check, { status: 200, body: "" }), /mong đợi 401 hoặc 405/);
});

test("danh sách kiểm tra có cả trang công khai lẫn route phải bị chặn", () => {
  assert.ok(CHECKS.some((check) => check.path === "/" && check.status.includes(200)));
  assert.ok(CHECKS.some((check) => check.path.startsWith("/api/cron") && check.status.includes(401)));
});
