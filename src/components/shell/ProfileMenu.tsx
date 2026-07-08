"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/Dropdown";

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
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
    <Dropdown
      align="right"
      width={230}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`flex items-center gap-2.5 h-[38px] pl-1 pr-3 rounded-[10px] bg-surface-hover border transition-colors ${
            open ? "border-border-strong" : "border-border hover:border-border-strong"
          }`}
        >
          <Avatar photoUrl={photoUrl} name={name} size={28} />
          <span className="text-[14px] font-semibold text-fg max-w-[120px] truncate">{name}</span>
        </button>
      )}
    >
      <div className="flex items-center gap-3 p-1.5 pb-3 mb-1 border-b border-border">
        <Avatar photoUrl={photoUrl} name={name} size={38} />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-fg truncate">{name}</p>
          <p className="text-[12px] text-fg-muted truncate">{roleLabel}</p>
        </div>
      </div>

      <DropdownItem onClick={() => fileInputRef.current?.click()}>
        {uploading ? "Enviando…" : "Alterar foto"}
      </DropdownItem>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && <p className="px-2 py-1 text-[12px] text-danger">{error}</p>}

      <DropdownSeparator />
      <DropdownItem danger onClick={handleLogout}>
        Sair
      </DropdownItem>
    </Dropdown>
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
