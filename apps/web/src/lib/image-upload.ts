/** Read a local image file and return a compressed JPEG data URL (max edge 512px). */
export async function readAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  if (file.size > 4_000_000) throw new Error("Image is too large (max 4 MB)");

  const bitmap = await createImageBitmap(file);
  const maxEdge = 512;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  if (dataUrl.length > 280_000) throw new Error("Image is still too large — try a smaller photo");
  return dataUrl;
}

export async function readLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  if (file.size > 6_000_000) throw new Error("Image is too large (max 6 MB)");

  const bitmap = await createImageBitmap(file);
  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > 480_000) throw new Error("Image is still too large — try a simpler logo");
  return dataUrl;
}
