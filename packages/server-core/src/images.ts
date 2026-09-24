const MAX_AVATAR_CHARS = 280_000;
const MAX_LOGO_CHARS = 480_000;

export function normalizeAvatarDataUrl(raw?: string | null): string | null {
  if (raw === undefined) return undefined as never;
  if (raw === null || raw === "") return null;
  const value = raw.trim();
  if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(value)) {
    throw new Error("invalid_image");
  }
  if (value.length > MAX_AVATAR_CHARS) throw new Error("image_too_large");
  return value;
}

export function normalizeLogoDataUrl(raw?: string | null): string | null {
  if (raw === undefined) return undefined as never;
  if (raw === null || raw === "") return null;
  const value = raw.trim();
  if (!/^data:image\/(jpeg|jpg|png|webp|svg\+xml);base64,/i.test(value)) {
    throw new Error("invalid_image");
  }
  if (value.length > MAX_LOGO_CHARS) throw new Error("image_too_large");
  return value;
}
