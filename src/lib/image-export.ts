// 图片导出工具：兼容 iOS Safari 与桌面浏览器。
//
// iOS Safari 会忽略 <a download> 属性，直接用 toDataURL + a.click() 无法真正保存图片。
// 因此这里优先使用 Web Share API（分享面板里有“存储图像”），
// 不支持时回退到“长按保存”预览层，桌面浏览器仍使用可靠的 a.download 方案。

export type SaveMethod = 'share' | 'download' | 'preview'

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOSDevice = /iP(hone|ad|od)/.test(ua)
  // iPadOS 13+ 会伪装成 Mac，需要用触摸点数量判断
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOSDevice || iPadOS
}

function supportsAnchorDownload(): boolean {
  if (typeof document === 'undefined') return false
  return 'download' in document.createElement('a')
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片数据生成失败'))
    }, type)
  })
}

// iOS 回退：全屏展示图片，提示用户长按保存到相册。
function showImagePreviewOverlay(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)

  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', '长按保存图片')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;box-sizing:border-box;'

  const tip = document.createElement('p')
  tip.textContent = '长按下方图片，选择“存储到照片 / 添加到照片”即可保存'
  tip.style.cssText = 'color:#fff;font-size:15px;line-height:1.5;margin:0;text-align:center;max-width:340px;'

  const img = document.createElement('img')
  img.src = url
  img.alt = filename
  img.style.cssText = 'max-width:100%;max-height:70vh;object-fit:contain;border-radius:10px;'
  // 允许 iOS 长按弹出“存储图像”菜单
  img.style.setProperty('-webkit-touch-callout', 'default')

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.textContent = '完成'
  closeBtn.style.cssText =
    'padding:10px 30px;border:none;border-radius:999px;background:#07c160;color:#fff;font-size:15px;font-weight:600;'

  const cleanup = () => {
    overlay.remove()
    URL.revokeObjectURL(url)
  }
  closeBtn.addEventListener('click', cleanup)
  overlay.addEventListener('click', event => {
    if (event.target === overlay) cleanup()
  })

  overlay.append(tip, img, closeBtn)
  document.body.appendChild(overlay)
}

/**
 * 保存 canvas 为 PNG 图片，自动选择当前环境最可靠的方式。
 * 返回实际使用的保存方式，方便调用方给出准确提示。
 */
export async function saveCanvasAsImage(canvas: HTMLCanvasElement, filename: string): Promise<SaveMethod> {
  const blob = await canvasToBlob(canvas, 'image/png')
  const file = new File([blob], filename, { type: 'image/png' })

  // 1) Web Share API + 文件：iOS Safari 的首选方案（分享面板含“存储图像”）
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] })
      return 'share'
    } catch (error) {
      // 用户主动取消分享，视为已处理，不再回退
      if (error instanceof DOMException && error.name === 'AbortError') return 'share'
      // 其他错误（如脱离用户手势）继续走后备方案
    }
  }

  // 2) 桌面等真正支持 <a download> 的浏览器：用 Object URL 直接下载
  if (!isIOS() && supportsAnchorDownload()) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    return 'download'
  }

  // 3) 最终后备（主要是 iOS Safari）：长按保存预览层
  showImagePreviewOverlay(blob, filename)
  return 'preview'
}

export function exportSuccessMessage(method: SaveMethod): string {
  switch (method) {
    case 'share':
      return '已打开系统分享，选择“存储图像”即可保存到相册'
    case 'download':
      return '图片已保存'
    case 'preview':
      return '已生成图片，请长按图片保存到相册'
  }
}
