/**
 * Reduce una imagen elegida por el usuario para guardarla dentro del guion: como mucho
 * `maxSide` píxeles por lado, en webp (o jpeg si el navegador no sabe hacer webp).
 */
export async function shrinkImage(file: File, maxSide = 800): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Eso no es una imagen.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("No he podido leer la imagen.");
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.82);
}
