export type PixelCrop = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.setAttribute("crossOrigin", "anonymous");
    img.src = src;
  });
}

// Recorta `imageSrc` (object URL do arquivo original) na área `crop` (em
// pixels da imagem original, já resolvida pelo react-easy-crop) e devolve um
// Blob no mesmo mimeType do arquivo original — preserva transparência de PNG
// (importante pra logo) em vez de forçar sempre JPEG.
export async function getCroppedImageBlob(
  imageSrc: string,
  crop: PixelCrop,
  mimeType: string
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não suportado.");

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem recortada."))),
      mimeType,
      0.92
    );
  });
}
