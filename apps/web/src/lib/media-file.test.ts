import test from "node:test";
import assert from "node:assert/strict";
import { mediaFileInfo } from "@/lib/media-file";

test("recognizes iPhone photos and videos when Safari omits MIME types", () => {
  assert.deepEqual(mediaFileInfo({ name: "IMG_1001.HEIC", type: "" }), { contentType: "image/heic", isVideo: false });
  assert.deepEqual(mediaFileInfo({ name: "IMG_1002.HEIF", type: "" }), { contentType: "image/heif", isVideo: false });
  assert.deepEqual(mediaFileInfo({ name: "IMG_1003.MOV", type: "" }), { contentType: "video/quicktime", isVideo: true });
});

test("prefers a browser-provided supported MIME type", () => {
  assert.deepEqual(mediaFileInfo({ name: "capture.jpg", type: "image/jpeg" }), { contentType: "image/jpeg", isVideo: false });
  assert.deepEqual(mediaFileInfo({ name: "capture.mp4", type: "video/mp4" }), { contentType: "video/mp4", isVideo: true });
});
