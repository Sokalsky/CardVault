const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
};

export function mediaFileInfo(file: { name: string; type: string }) {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  const contentType = file.type.toLowerCase() || mimeByExtension[extension] || "";
  const isVideo = contentType.startsWith("video/") || ["mov", "mp4", "m4v", "webm"].includes(extension);
  return { contentType, isVideo };
}
