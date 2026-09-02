import { useRef } from 'react';
import { Users, Upload, X, UserCheck } from 'lucide-react';
import { getDefaultAvatar } from '@/lib/parser';
import type { ChatUser } from '@/types';

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

async function normalizeAvatar(file: Blob): Promise<string> {
  const original = await readFileAsDataUrl(file);
  try {
    const img = await decodeImage(original);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return original;

    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 统一转成 PNG Data URL，避免 iOS Safari 对用户原始 JPEG/WebP/HEIC
    // 在 html-to-image 的导出链路中出现空白。
    return canvas.toDataURL('image/png');
  } catch {
    return original;
  }
}


interface UserAvatarManagerProps {
  users: ChatUser[];
  selfId: number | null;
  onUpdateAvatar: (userId: number, avatar: string) => void;
  onRemoveAvatar: (userId: number) => void;
  onSetSelf: (userId: number) => void;
}

function AvatarCard({ user, index, isSelf, onUpdateAvatar, onRemoveAvatar, onSetSelf }: {
  user: ChatUser;
  index: number;
  isSelf: boolean;
  onUpdateAvatar: (userId: number, avatar: string) => void;
  onRemoveAvatar: (userId: number) => void;
  onSetSelf: (userId: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarSrc = user.avatar || getDefaultAvatar(index);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await normalizeAvatar(file);
      onUpdateAvatar(user.id, dataUrl);
    } catch {
      // 理论上 normalizeAvatar 已处理失败；这里保留最原始的读取兜底。
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === 'string') onUpdateAvatar(user.id, result);
      };
      reader.readAsDataURL(file);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="avatar-card">
      <div className="avatar-img-wrap">
        <img src={avatarSrc} alt={user.name} />
        <div className="avatar-overlay" onClick={() => fileRef.current?.click()}>
          <Upload size={20} color="#fff" />
        </div>
        {user.avatar && (
          <button className="avatar-remove" onClick={() => onRemoveAvatar(user.id)}>
            <X size={12} />
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      </div>
      <span className="avatar-name">{user.name}</span>
      {isSelf
        ? <span className="avatar-tag">自己</span>
        : <button className="avatar-set-self" onClick={() => onSetSelf(user.id)}><UserCheck size={12} /> 设为自己</button>
      }
    </div>
  );
}

export function UserAvatarManager({ users, selfId, onUpdateAvatar, onRemoveAvatar, onSetSelf }: UserAvatarManagerProps) {
  if (users.length === 0) return null;

  return (
    <div className="s-card">
      <div className="s-card-header">
        <h2><Users size={20} /> 用户头像管理</h2>
        <span className="s-card-badge">{users.length} 个用户</span>
      </div>
      <div className="s-card-body">
        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>鼠标悬停头像可上传自定义图片</p>
        <div className="avatar-grid">
          {users.map((user, index) => (
            <AvatarCard
              key={user.id}
              user={user}
              index={index}
              isSelf={user.id === selfId}
              onUpdateAvatar={onUpdateAvatar}
              onRemoveAvatar={onRemoveAvatar}
              onSetSelf={onSetSelf}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
