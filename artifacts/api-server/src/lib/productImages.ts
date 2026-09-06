const API_STORAGE_PREFIX = "/api/storage";
const STORAGE_PREFIX = "/storage";

export function normalizeStoredImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith(`${API_STORAGE_PREFIX}/objects/`)) {
    return trimmed.slice(API_STORAGE_PREFIX.length);
  }
  if (trimmed.startsWith(`${STORAGE_PREFIX}/objects/`)) {
    return trimmed.slice(STORAGE_PREFIX.length);
  }
  return trimmed;
}

export function toRenderableImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const normalized = normalizeStoredImageUrl(imageUrl);
  return normalized.startsWith("/objects/")
    ? `${API_STORAGE_PREFIX}${normalized}`
    : normalized;
}

export function toRenderableImageUrls(imageUrls: string[]): string[] {
  return imageUrls.map((imageUrl) => toRenderableImageUrl(imageUrl)!);
}