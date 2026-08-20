import assert from "node:assert/strict";
import test from "node:test";
import { assessMediaReadiness } from "@/lib/media-readiness";

const image = (captureType: string, processingStatus = "ready", selectedForGrading = true) => ({
  kind: "image", captureType, processingStatus, selectedForGrading,
});

test("requires ready selected front and back media", () => {
  assert.equal(assessMediaReadiness([image("front"), image("back")]).ready, true);
  assert.equal(assessMediaReadiness([image("front")]).ready, false);
  assert.equal(assessMediaReadiness([image("front"), image("back", "failed")]).ready, false);
});

test("blocks readiness while any upload or video is processing", () => {
  const result = assessMediaReadiness([image("front"), image("back"), { kind: "video", captureType: "other", processingStatus: "processing", selectedForGrading: false }]);
  assert.equal(result.ready, false);
  assert.equal(result.pendingCount, 1);
});

test("requires a failed upload to be retried or explicitly removed", () => {
  const result = assessMediaReadiness([image("front"), image("back"), image("other", "failed", false)]);
  assert.equal(result.ready, false);
  assert.equal(result.failedCount, 1);
});
