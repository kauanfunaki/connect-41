"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  name: string;
  roleLabel: string;
  photoUrl: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function ProfileMenu({ name, roleLabel, photoUrl: initialPhotoUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/users/me/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao enviar foto.");
      } else {
        setPhotoUrl(data.photoUrl);
      }
    } catch {
      setError("Erro ao enviar foto.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-2.5 h-[38px] pl-1 pr-3 rounded-[10px] bg-surface-hover border transition-colors ${
          open ? "border-border-strong" : "border-border hover:border-border-strong"
        }`}
      >
        <Avatar photoUrl={photoUrl} name={name} size={28} />
        <span className="text-[14px] font-semibold text-fg max-w-[120px] truncate">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] w-[230px] bg-surface-elevated border border-border-strong rounded-2xl shadow-[var(--c41-shadow-lg)] p-3 z-20">
          <div className="flex items-center gap-3 p-1.5 pb-3 mb-1 border-b border-border">
            <Avatar photoUrl={photoUrl} name={name} size={38} />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-fg truncate">{name}</p>
              <p className="text-[12px] text-fg-muted truncate">{roleLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full text-left px-2 py-2 rounded-lg text-[14px] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors disabled:opacity-60"
          >
            {uploading ? "Enviando…" : "Alterar foto"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {error && <p className="px-2 py-1 text-[12px] text-danger">{error}</p>}

          <div className="mt-1 pt-1 border-t border-border">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-2 py-2 rounded-lg text-[14px] font-medium text-danger hover:bg-danger-bg transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ photoUrl, name, size }: { photoUrl: string | null; name: string; size: number }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-brand/10 text-brand font-medium flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}
