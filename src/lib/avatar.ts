/**
 * Turn a user-picked image file into a small, square, compressed JPEG data URL
 * suitable for storing directly in players.avatar_url (no external storage).
 * Center-crops to a square and downscales so rows stay tiny (~a few KB).
 */
export async function fileToAvatarDataUrl(file: File, size = 160): Promise<string> {
  const img = await loadImage(file);
  const min = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - min) / 2;
  const sy = (img.naturalHeight - min) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}
