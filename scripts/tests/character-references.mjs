import { test } from "node:test";
import assert from "node:assert/strict";
import {
  characterReferenceSources,
  MAX_CHARACTER_REFERENCES,
} from "../short-film/character-references.mjs";

test("ưu tiên ảnh cận mặt, rồi thân, rồi tạo hình", () => {
  const picked = characterReferenceSources({
    referenceImages: ["body-1.png", "look-1.png", "face-1.png", "body-2.png"],
    referenceRoles: ["identity_body", "look", "identity_face", "identity_body"],
  });
  assert.deepEqual(picked, ["face-1.png", "body-1.png", "look-1.png"]);
});

test("không gửi quá ba ảnh cho một nhân vật", () => {
  const picked = characterReferenceSources({
    referenceImages: ["a.png", "b.png", "c.png", "d.png", "e.png"],
    referenceRoles: ["look", "look", "look", "look", "look"],
  });
  assert.equal(picked.length, MAX_CHARACTER_REFERENCES);
});

test("giữ hành vi cũ khi bộ ảnh không ghi vai trò", () => {
  assert.deepEqual(
    characterReferenceSources({ referenceImages: ["1.png", "2.png", "3.png", "4.png"] }),
    ["1.png", "2.png", "3.png"],
  );
});

test("rơi về ảnh đại diện khi chưa có ảnh chuẩn nào", () => {
  assert.deepEqual(characterReferenceSources({ imageUrl: "avatar.png" }), ["avatar.png"]);
  assert.deepEqual(characterReferenceSources({}), []);
});

test("bù bằng ảnh chưa dùng khi thiếu vai trò", () => {
  // Đúng tình trạng hiện tại của dự án: chỉ có một ảnh toàn thân.
  assert.deepEqual(
    characterReferenceSources({
      referenceImages: ["body.png"],
      referenceRoles: ["identity_body"],
    }),
    ["body.png"],
  );
});
