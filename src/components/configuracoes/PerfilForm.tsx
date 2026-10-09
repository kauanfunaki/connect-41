"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { ImageCropModal } from "@/components/shared/ImageCropModal";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { PerfilState } from "@/app/(app)/configuracoes/actions";
import { Aviso } from "@/components/ui/Aviso";

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
        <Aviso>
          {state.error}
        </Aviso>
      )}
      {state && "success" in state && (
        <Aviso tom="sucesso">
          Perfil atualizado.
        </Aviso>
      )}

      <div className="flex items-center gap-4">
        <AvatarImage src={photoUrl} name={name || defaultName} size={64} />
        <div>
          {/* Secundário padrão, igual ao "Trocar foto" do workspace: o fundo
              cinza e a borda azul no hover eram só desta tela. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Enviando…" : "Alterar foto"}
          </Button>
          <p className="text-helper text-fg-muted mt-1.5">JPG, PNG ou WEBP, até 2MB.</p>
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

      <FieldGrid>
        <CampoForm label="Nome" htmlFor="name" required>
          <Input id="name" name="name" type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="email" helper="Só um administrador pode alterar seu e-mail de acesso.">
          <Input id="email" type="email" value={email} readOnly disabled />
        </CampoForm>
      </FieldGrid>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button type="submit" loading={isPending}>
          Salvar
        </Button>
      </div>

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
