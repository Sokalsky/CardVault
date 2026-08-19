import { mediaFileInfo } from "@/lib/media-file";

export function inferredCaptureType(file: { name: string; type: string }, photoIndex: number) {
  const name = file.name.toLowerCase();
  const { isVideo } = mediaFileInfo(file);
  if (/center|centering/.test(name) && !isVideo) return "centering";
  if (/defect|damage|scratch|crease/.test(name)) return "defect_macro";
  if (/corner/.test(name)) return "corner_macro";
  if (/top[ _.-]*edge/.test(name)) return "top_edge";
  if (/bottom[ _.-]*edge/.test(name)) return "bottom_edge";
  if (/left[ _.-]*edge/.test(name)) return "left_edge";
  if (/right[ _.-]*edge/.test(name)) return "right_edge";
  if (/front/.test(name)) return isVideo ? "front_surface" : "front";
  if (/back|reverse/.test(name)) return isVideo ? "back_surface" : "back";
  if (!isVideo && photoIndex === 0) return "front";
  if (!isVideo && photoIndex === 1) return "back";
  return "other";
}
