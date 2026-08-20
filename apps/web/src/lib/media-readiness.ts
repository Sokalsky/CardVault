export type ReadinessMedia = {
  kind: string;
  captureType: string;
  processingStatus?: string | null;
  selectedForGrading: boolean;
};

const pendingStatuses = new Set(["uploading", "queued", "processing", "uploaded_unprocessed"]);

export function assessMediaReadiness(media: ReadinessMedia[]) {
  const pending = media.filter((item) => pendingStatuses.has(item.processingStatus || ""));
  const failed = media.filter((item) => item.processingStatus === "failed");
  const selectedImages = media.filter((item) =>
    item.kind !== "video"
    && item.kind !== "contact_sheet"
    && item.processingStatus === "ready"
    && item.selectedForGrading,
  );
  const hasFront = selectedImages.some((item) => item.captureType === "front");
  const hasBack = selectedImages.some((item) => item.captureType === "back");
  const hasImportedPair = selectedImages.filter((item) => item.captureType === "imported_grading_photo").length >= 2;
  const hasFrontAndBack = (hasFront && hasBack) || hasImportedPair;

  const reasons: string[] = [];
  if (pending.length) reasons.push(`${pending.length} upload${pending.length === 1 ? " is" : "s are"} still uploading or processing`);
  if (failed.length) reasons.push(`${failed.length} failed upload${failed.length === 1 ? " must" : "s must"} be retried or removed`);
  if (!hasFrontAndBack) reasons.push("a ready front and back photo must both be selected");

  return {
    ready: reasons.length === 0,
    reasons,
    pendingCount: pending.length,
    failedCount: failed.length,
    selectedImageCount: selectedImages.length,
    hasFrontAndBack,
  };
}
