"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { uploadComProgresso } from "@/lib/uploadComProgresso";
import { Button } from "@/components/ui/Button";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { CATEGORY_LABEL, CATEGORY_OPTIONS, TETO_DOS_DOCUMENTOS_MB } from "@/lib/document-categories";
import type { DocumentCategory, DocumentEntityType } from "@/generated/prisma/enums";

// Precisa bater com o que /api/documents aceita — divergir daria erro só
// depois do envio, com o arquivo já subindo.
export const ACEITOS_NOS_DOCUMENTOS = ".jpg,.jpeg,.png,.webp,.pdf";

type Props = {
  entityType: DocumentEntityType;
  entityId: string;
  /** Categoria que já vem marcada — "Currículo" no bloco do currículo. */
  categoriaInicial?: DocumentCategory;
  /** Extensões aceitas; padrão, as de /api/documents. */
  accept?: string;
  /** Classes do formulário (borda, espaçamento de quem usa). */
  className?: string;
  /** Depois de enviar tudo sem erro — o diálogo que abriu o envio se fecha. */
  onEnviado?: () => void;
};

/**
 * O envio de documentos: área de soltar arquivo, categoria, vencimento e
 * "sensível", com fila e progresso. Saiu do `DocumentsSection` em 14/10/2026
 * para a ficha do candidato abrir o envio só ao clicar em "Anexar" (escolha
 * 4A do Kauan); a seção de documentos das outras fichas usa o mesmo.
 */
export function DocumentUploadForm({
  entityType,
  entityId,
  categoriaInicial = "OUTRO",
  accept = ACEITOS_NOS_DOCUMENTOS,
  className = "",
  onEnviado,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);

  function adicionarNaFila(files: File[]) {
    setFila((prev) => [
      ...prev,
      ...files.map((file) => ({
        // `File` não tem id e o nome pode repetir; a chave precisa ser estável
        // entre renders para a barra de progresso não pular de linha.
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        progresso: 0,
        estado: "pendente" as const,
      })),
    ]);
  }

  function atualizar(id: string, mudanca: Partial<ArquivoNaFila>) {
    setFila((prev) => prev.map((a) => (a.id === id ? { ...a, ...mudanca } : a)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (fila.length === 0) return;
    setIsUploading(true);

    // Categoria, vencimento e "sensível" valem para a leva inteira — são do
    // lote, não de cada arquivo.
    const base = new FormData(e.currentTarget);

    // Um de cada vez, e não `Promise.all`: em paralelo as barras avançam juntas
    // sem dizer qual arquivo está onde, e uma leva grande satura a conexão,
    // deixando todas lentas em vez de terminar as primeiras logo.
    let falhas = 0;
    for (const item of fila) {
      if (item.estado === "concluido") continue;
      atualizar(item.id, { estado: "enviando", progresso: 0, erro: undefined });

      const form = new FormData();
      for (const [k, v] of base.entries()) {
        if (k !== "file") form.append(k, v);
      }
      form.set("entityType", entityType);
      form.set("entityId", entityId);
      form.set("file", item.file);

      const r = await uploadComProgresso("/api/documents", form, (pct) => atualizar(item.id, { progresso: pct }));

      if (r.ok) {
        atualizar(item.id, { estado: "concluido", progresso: 100 });
      } else {
        falhas++;
        atualizar(item.id, { estado: "erro", erro: r.erro });
      }
    }

    setIsUploading(false);

    if (falhas === 0) {
      // Só limpa quando tudo passou. Com falha, a fila fica na tela mostrando
      // qual arquivo deu erro — e reenviar pula os que já concluíram.
      setFila([]);
      formRef.current?.reset();
      onEnviado?.();
    } else {
      setError(
        falhas === 1
          ? "Um arquivo não foi enviado — veja o erro na lista."
          : `${falhas} arquivos não foram enviados — veja os erros na lista.`
      );
    }
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={`flex flex-col gap-4 ${className}`.trim()}>
      <FileDropzone
        accept={accept}
        maxSizeMb={TETO_DOS_DOCUMENTOS_MB}
        multiple
        arquivos={fila}
        onAdicionar={adicionarNaFila}
        onRemover={(id) => setFila((prev) => prev.filter((a) => a.id !== id))}
        desabilitado={isUploading}
      />

      {/* Revisão de alinhamento (30/09): a caixa "Documento sensível" era
          acertada com `pb-2` e o botão com `items-end`. Agora os dois vão
          em `AlinhadoAoCampo`, na altura dos campos, e a fileira quebra
          igual em qualquer largura (a seção também aparece em painéis
          estreitos). */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-full sm:w-48">
          <CampoForm label="Categoria" htmlFor="category">
            <Select id="category" name="category" defaultValue={categoriaInicial} disabled={isUploading}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </CampoForm>
        </div>
        <div className="w-full sm:w-44">
          <CampoForm label="Vencimento" htmlFor="expiresAt" helper="Opcional.">
            <CampoData id="expiresAt" name="expiresAt" disabled={isUploading} />
          </CampoForm>
        </div>
        <AlinhadoAoCampo>
          <Checkbox name="sensitive" value="true" label="Documento sensível" disabled={isUploading} />
        </AlinhadoAoCampo>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isUploading || fila.length === 0} variant="primary">
            {isUploading ? "Enviando…" : fila.length > 1 ? `Anexar ${fila.length} arquivos` : "Anexar"}
          </Button>
        </AlinhadoAoCampo>
      </div>

      {error && <Aviso>{error}</Aviso>}
    </form>
  );
}
