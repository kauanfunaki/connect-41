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
        className="flex items-center gap-2 pl-1 pr-2 h-8 rounded-md hover:bg-surface-2 transition-colors"
      >
        <Avatar photoUrl={photoUrl} name={name} size={26} />
        <span className="text-[12px] font-medium text-fg max-w-[120px] truncate">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-[240px] bg-surface border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.1)] py-2 z-20">
          <div className="flex items-center gap-3 px-3 pb-2.5 mb-1 border-b border-border">
            <Avatar photoUrl={photoUrl} name={name} size={34} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg truncate">{name}</p>
              <p className="text-[11px] text-fg-muted truncate">{roleLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full text-left px-3 py-1.5 text-[12px] text-fg-secondary hover:bg-surface-2 hover:text-fg transition-colors disabled:opacity-60"
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

          {error && <p className="px-3 py-1 text-[11px] text-danger">{error}</p>}

          <div className="mt-1 pt-1 border-t border-border">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-3 py-1.5 text-[12px] text-danger hover:bg-danger/8 transition-colors"
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
