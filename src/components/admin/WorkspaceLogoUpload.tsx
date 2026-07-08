"use client";

import { useRef, useState } from "react";

type Props = {
  tenantId: string;
  tenantName: string;
  logoUrl: string | null;
};

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function WorkspaceLogoUpload({ tenantId, tenantName, logoUrl: initialLogoUrl }: Props) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${tenantId}/logo`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao remover foto.");
      } else {
        setLogoUrl(null);
      }
    } catch {
      setError("Erro ao remover foto.");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/admin/workspaces/${tenantId}/logo`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao enviar foto.");
      } else {
        setLogoUrl(data.logoUrl);
      }
    } catch {
      setError("Erro ao enviar foto.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={tenantName}
          width={56}
          height={56}
          className="rounded-lg object-cover flex-shrink-0 border border-border"
          style={{ width: 56, height: 56 }}
        />
      ) : (
        <span className="w-14 h-14 rounded-lg bg-brand-subtle text-brand font-display font-semibold text-[20px] flex items-center justify-center flex-shrink-0">
          {initial(tenantName)}
        </span>
      )}

      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-60"
          >
            {uploading ? "Enviando…" : logoUrl ? "Trocar foto" : "Adicionar foto"}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="h-8 px-3 rounded-md text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors disabled:opacity-60"
            >
              Remover
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
      </div>
    </div>
  );
}
