// 用户上传的图片会被规范化为一个体积可控、可被 html-to-image 可靠内嵌的 data URL。
// 全程在浏览器本地完成，不上传服务器，也不使用 blob/object URL 参与截图。

export type NormalizeOptions = {
  /** 输出的最大边长（像素）。超过则等比缩小，小于则保持原尺寸。 */
  maxSize: number;
  /** JPEG 编码质量（0-1），仅在输出 JPEG 时生效。 */
  quality?: number;
};

/** 将 File/Blob 读成 data URL。 */
function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 将 data URL 载入为已解码的 HTMLImageElement。 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

/**
 * 把上传的图片规范化为一个自包含、体积较小的 data URL：
 * 1. 读成 data URL 并解码；
 * 2. 等比缩放到 maxSize 以内（不放大）；
 * 3. 重新编码——原图为 PNG 时保留 PNG（保住透明通道），否则用 JPEG 压缩。
 * 缩放后的图片解码更快、体积更小，能在所有浏览器（含 iOS Safari）的
 * html-to-image 导出中稳定渲染。
 */
export async function normalizeUploadedImage(
  file: Blob,
  { maxSize, quality = 0.92 }: NormalizeOptions,
): Promise<string> {
  const originalDataUrl = await readAsDataUrl(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(originalDataUrl);
  } catch {
    // 解码失败时退回原始 data URL，至少不丢失用户内容。
    return originalDataUrl;
  }

  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return originalDataUrl;

  const scale = Math.min(1, maxSize / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalDataUrl;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const keepPng = /^data:image\/(png|gif|webp)/i.test(originalDataUrl);
  const mime = keepPng ? 'image/png' : 'image/jpeg';
  try {
    return canvas.toDataURL(mime, mime === 'image/jpeg' ? quality : undefined);
  } catch {
    return originalDataUrl;
  }
}

/**
 * 等待某个 DOM 节点内的所有 <img> 完成加载与解码。
 * 在调用 html-to-image 之前使用，确保被截图的图片（尤其是较大的自定义
 * 头像/图片 data URL）已经解码，避免导出出现空白。
 */
export async function waitForImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      try {
        if (!img.complete || img.naturalWidth === 0) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        }
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => undefined);
        }
      } catch {
        // 单张图片失败不应阻断整体导出。
      }
    }),
  );
}
