export function advanceGalleryIndex(
  currentIndex: number,
  imageCount: number,
  direction: -1 | 1,
): number {
  if (imageCount <= 0) return 0;
  if (direction === -1) {
    return currentIndex > 0 ? currentIndex - 1 : imageCount - 1;
  }
  return currentIndex < imageCount - 1 ? currentIndex + 1 : 0;
}
