"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { ImageCropModal } from "@/components/shared/ImageCropModal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { PerfilState } from "@/app/(app)/configuracoes/actions";

type Props = {
  action: (prev: PerfilState, form: FormData) => Promise<PerfilState>;
  defaultName: string;
  email: string;
  photoUrl: string | null;
};

export function PerfilForm({ action, defaultName, email, photoUrl: initialPhotoUrl }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [name, setName] = useState(defaultName);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  function resetInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCropConfirm(blob: Blob) {
    setPendingFile(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", blob, `photo.${blob.type.split("/")[1] ?? "jpg"}`);
      const res = await fetch("/api/users/me/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar foto.");
      } else {
        setPhotoUrl(data.photoUrl);
        toast.success("Foto atualizada.");
        // O avatar também vive no cabeçalho, montado no servidor.
        router.refresh();
      }
    } catch {
      toast.error("Erro ao enviar foto.");
    } finally {
      setUploading(false);
      resetInput();
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {state && "error" in state && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
          Perfil atualizado.
        </p>
      )}

      <div className="flex items-center gap-4">
        <AvatarImage src={photoUrl} name={name || defaultName} size={64} />
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8 px-3 rounded-md border border-border-strong bg-surface-hover text-fg text-[12px] font-medium hover:border-brand transition-colors disabled:opacity-[var(--c41-disabled-op)]"
          >
            {uploading ? "Enviando…" : "Alterar foto"}
          </button>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1.5">JPG, PNG ou WEBP, até 2MB.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPendingFile(file);
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Nome" htmlFor="name" required>
          <Input id="name" name="name" type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="email" helper="Só um administrador pode alterar seu e-mail de acesso.">
          <Input id="email" type="email" value={email} readOnly disabled />
        </CampoForm>
      </div>

      <Button type="submit" loading={isPending}>
        Salvar
      </Button>

      <ImageCropModal
        file={pendingFile}
        onCancel={() => {
          setPendingFile(null);
          resetInput();
        }}
        onConfirm={handleCropConfirm}
      />
    </form>
  );
}
