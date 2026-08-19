import test from "node:test";
import assert from "node:assert/strict";
import { inferredCaptureType } from "@/lib/media-capture";

test("unnamed bulk photos use front then back ordering", () => {
  assert.equal(inferredCaptureType({ name: "IMG_1001.HEIC", type: "image/heic" }, 0), "front");
  assert.equal(inferredCaptureType({ name: "IMG_1002.HEIC", type: "image/heic" }, 1), "back");
  assert.equal(inferredCaptureType({ name: "IMG_1003.HEIC", type: "image/heic" }, 2), "other");
});

test("descriptive names classify mixed bulk media", () => {
  assert.equal(inferredCaptureType({ name: "front-sweep.mov", type: "video/quicktime" }, -1), "front_surface");
  assert.equal(inferredCaptureType({ name: "bottom_edge.mp4", type: "video/mp4" }, -1), "bottom_edge");
  assert.equal(inferredCaptureType({ name: "centering.png", type: "image/png" }, 4), "centering");
});
