"use client";

import { useId, useRef, useState } from "react";
import { UploadCloud, X, AlertCircle } from "lucide-react";
import { aceitaArquivo, extensaoDe, formatarBytes } from "@/lib/fileSize";

type Props = {
  name: string;
  accept: string;
  maxSizeMb: number;
  required?: boolean;
  id?: string;
  /**
   * Faixa de uma linha em vez da área alta.
   *
   * Para formulários com VÁRIOS campos de arquivo — a admissão tem seis (RG,
   * CPF, comprovante, foto, CTPS, ASO), e seis áreas altas empilhadas somam
   * mais de 500px de dropzone, o que é pior de usar que o input cru que elas
   * vieram substituir.
   */
  compacto?: boolean;
  /**
   * Avisa quem usa qual arquivo está escolhido — inclusive `null` ao limpar.
   *
   * Para as telas que NÃO submetem o input pelo formulário: o cadastro de
   * pessoa junta os documentos numa lista e só os envia depois que a pessoa
   * existe, então precisa do `File` em mãos antes do submit.
   */
  onFileChange?: (file: File | null) => void;
};

/**
 * Dropzone que é um CAMPO de formulário — mantém um `<input type="file">` real,
 * então o `<form>` o submete nativamente, com Server Action ou action de rota.
 *
 * Existe ao lado do `FileDropzone` porque as duas situações são diferentes:
 * aquele controla a fila e o envio por XHR (para ter barra de progresso), este
 * só troca a aparência do input num formulário que já submete sozinho. Tentar
 * unificar obrigaria todo formulário simples a virar upload manual.
 *
 * O arquivo não é copiado para estado: quem guarda é o próprio input, que é o
 * que o formulário lê. O estado local serve só para desenhar o nome escolhido.
 */
export function FileDropzoneField({
  name,
  accept,
  maxSizeMb,
  required = false,
  id,
  compacto = false,
  onFileChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [escolhido, setEscolhido] = useState<File | null>(null);
  const [sobre, setSobre] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputIdGerado = useId();
  const inputId = id ?? inputIdGerado;

  function validar(file: File): string | null {
    if (!aceitaArquivo(file.name, accept)) return "Formato não aceito.";
    if (file.size > maxSizeMb * 1024 * 1024) {
      return `${formatarBytes(file.size)}, acima do limite de ${maxSizeMb} MB.`;
    }
    return null;
  }

  function receber(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const problema = validar(file);
    if (problema) {
      setErro(`${file.name}: ${problema}`);
      setEscolhido(null);
      if (inputRef.current) inputRef.current.value = "";
      onFileChange?.(null);
      return;
    }
    setErro(null);
    setEscolhido(file);
    onFileChange?.(file);
  }

  function limpar() {
    setEscolhido(null);
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileChange?.(null);
  }

  const formatosLegiveis = accept
    .split(",")
    .map((a) => a.trim().replace(/^\./, "").toUpperCase())
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-2">
      {escolhido ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <span
            className="grid place-items-center w-9 h-9 shrink-0 rounded-md bg-brand/10 text-[10px] font-semibold text-brand"
            aria-hidden="true"
          >
            {extensaoDe(escolhido.name).slice(0, 4) || "?"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[length:var(--fs-body)] text-fg" title={escolhido.name}>
              {escolhido.name}
            </p>
            <p className="text-[length:var(--fs-helper)] text-fg-muted">{formatarBytes(escolhido.size)}</p>
          </div>
          <button
            type="button"
            onClick={limpar}
            aria-label={`Remover ${escolhido.name}`}
            className="shrink-0 p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            // Passa pelo input para o formulário enxergar o arquivo: soltar
            // num label não preenche o campo sozinho.
            if (inputRef.current && e.dataTransfer.files.length > 0) {
              inputRef.current.files = e.dataTransfer.files;
              receber(e.dataTransfer.files);
            }
          }}
          className={
            compacto
              ? `flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 cursor-pointer transition-colors ${
                  sobre
                    ? "border-brand bg-brand/5"
                    : "border-border-strong bg-surface hover:border-brand hover:bg-surface-hover"
                }`
              : `flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-5 py-6 text-center cursor-pointer transition-colors ${
                  sobre
                    ? "border-brand bg-brand/5"
                    : "border-border-strong bg-surface hover:border-brand hover:bg-surface-hover"
                }`
          }
        >
          <span
            className={`grid place-items-center rounded-full shrink-0 ${compacto ? "w-7 h-7" : "w-9 h-9"} ${
              sobre ? "bg-brand/15 text-brand" : "bg-surface-2 text-fg-muted"
            }`}
          >
            <UploadCloud size={compacto ? 15 : 18} />
          </span>
          {compacto ? (
            <span className="min-w-0 flex-1 text-[length:var(--fs-helper)] text-fg-muted truncate">
              <span className="text-brand underline underline-offset-2">Escolher arquivo</span> ou
              arraste aqui · {formatosLegiveis} · até {maxSizeMb} MB
            </span>
          ) : (
            <>
              <span className="text-[length:var(--fs-body)] text-fg">
                Arraste o arquivo aqui ou{" "}
                <span className="text-brand underline underline-offset-2">clique para escolher</span>
              </span>
              <span className="text-[length:var(--fs-helper)] text-fg-muted">
                {formatosLegiveis} · até {maxSizeMb} MB
              </span>
            </>
          )}
        </label>
      )}

      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(e) => receber(e.target.files)}
      />

      {erro && (
        <p className="flex items-start gap-1.5 text-[length:var(--fs-helper)] text-danger" role="alert">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}
