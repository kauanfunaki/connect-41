"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { UploadCloud, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { aceitaArquivo, extensaoDe, formatarBytes, formatosDoAccept } from "@/lib/fileSize";
import { arquivosDaColagem, nomeDoArquivoColado } from "@/lib/arquivoColado";

/** Estado de um arquivo na fila, do momento em que é escolhido até o fim. */
export type ArquivoNaFila = {
  /** Chave estável: `File` não tem id e o nome pode repetir. */
  id: string;
  file: File;
  progresso: number;
  estado: "pendente" | "enviando" | "concluido" | "erro";
  erro?: string;
  /**
   * Endereço local (`URL.createObjectURL`) de uma imagem, para a fila mostrar a
   * miniatura no lugar do selo da extensão. Quem cria o endereço o libera.
   */
  miniatura?: string;
};

type Props = {
  /** Extensões aceitas, como no atributo nativo: ".pdf,.jpg,.png". */
  accept: string;
  maxSizeMb: number;
  multiple?: boolean;
  arquivos: ArquivoNaFila[];
  onAdicionar: (files: File[]) => void;
  onRemover: (id: string) => void;
  /** Desliga a área toda enquanto o formulário envia. */
  desabilitado?: boolean;
  /**
   * Aceita Ctrl+V em qualquer ponto da página (05/11/2026): o print colado
   * entra na fila com as mesmas regras de formato e tamanho. Colagem com texto
   * fica para o campo onde se está digitando (`arquivosDaColagem`).
   */
  colarNaPagina?: boolean;
};

// Cor por tipo — só o suficiente pra reconhecer o arquivo de relance, sem virar
// semáforo. PDF vermelho é a convenção que todo mundo já lê. Mesmo mapa do
// DocumentsSection, mantido em sincronia à mão: são 6 linhas, e extrair criaria
// uma dependência entre um componente de UI genérico e o módulo de documentos.
const COR_POR_EXT: Record<string, string> = {
  PDF: "var(--c41-danger)",
  DOC: "#2563EB",
  DOCX: "#2563EB",
  XLS: "var(--c41-success)",
  XLSX: "var(--c41-success)",
  CSV: "var(--c41-success)",
};

/**
 * Área de upload com arrastar-e-soltar, fila e progresso.
 *
 * Substitui o `<input type="file">` cru, que mostrava "Nenhum arquivo
 * escolhido" e não dava pista de formato aceito, tamanho máximo, nem do que
 * estava acontecendo durante o envio.
 *
 * O componente **não envia nada**: ele cuida de escolher, validar e exibir.
 * Quem usa decide como sobe (e atualiza `progresso`/`estado` de cada item),
 * porque cada tela tem campos próprios para mandar junto — categoria e
 * vencimento em documentos, competência na folha, e assim por diante.
 */
export function FileDropzone({
  accept,
  maxSizeMb,
  multiple = false,
  arquivos,
  onAdicionar,
  onRemover,
  desabilitado = false,
  colarNaPagina = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [recusados, setRecusados] = useState<string[]>([]);
  const inputId = useId();
  // Conta os prints colados nesta tela: do segundo em diante, o nome leva o
  // número, para dois prints do mesmo minuto não saírem com o mesmo nome.
  const colados = useRef(0);

  function peneirar(lista: FileList | File[] | null) {
    if (!lista) return;
    const aceitos: File[] = [];
    const problemas: string[] = [];

    for (const file of Array.from(lista)) {
      if (!aceitaArquivo(file.name, accept)) {
        problemas.push(`${file.name}: formato não aceito`);
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        // Dizer o tamanho do arquivo junto do limite evita a segunda pergunta.
        problemas.push(`${file.name}: ${formatarBytes(file.size)}, acima do limite de ${maxSizeMb} MB`);
        continue;
      }
      aceitos.push(file);
    }

    setRecusados(problemas);
    if (aceitos.length > 0) onAdicionar(multiple ? aceitos : aceitos.slice(0, 1));
  }

  const aoColar = useEffectEvent((e: ClipboardEvent) => {
    if (desabilitado || !e.clipboardData) return;
    const arquivos = arquivosDaColagem(Array.from(e.clipboardData.files), e.clipboardData.getData("text/plain"));
    if (!arquivos.length) return;
    e.preventDefault();
    const quando = new Date();
    peneirar(arquivos.map(f => {
      const nome = nomeDoArquivoColado(f.name, quando, colados.current + 1);
      if (nome === f.name) return f;
      colados.current++;
      return new File([f], nome, { type: f.type, lastModified: f.lastModified });
    }));
  });
  useEffect(() => {
    if (!colarNaPagina) return;
    const ouvir = (e: ClipboardEvent) => aoColar(e);
    document.addEventListener("paste", ouvir);
    return () => document.removeEventListener("paste", ouvir);
  }, [colarNaPagina]);

  const formatosLegiveis = formatosDoAccept(accept);

  return (
    <div className="flex flex-col gap-3">
      {/* A área inteira é um label: clicar em qualquer ponto abre o seletor,
          sem precisar acertar um botão pequeno. */}
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!desabilitado) setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          if (!desabilitado) peneirar(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
          desabilitado
            ? "cursor-not-allowed border-border bg-surface-2 opacity-60"
            : sobre
              ? "cursor-pointer border-brand bg-brand/5"
              : "cursor-pointer border-border-strong bg-surface hover:border-brand hover:bg-surface-hover"
        }`}
      >
        <span
          className={`grid place-items-center w-10 h-10 rounded-full ${
            sobre ? "bg-brand/15 text-brand" : "bg-surface-2 text-fg-muted"
          }`}
        >
          <UploadCloud size={20} />
        </span>
        <span className="text-body font-medium text-fg">
          Arraste {multiple ? "os arquivos" : "o arquivo"} aqui{colarNaPagina ? ", cole (Ctrl+V)" : ""} ou{" "}
          <span className="text-brand underline underline-offset-2">clique para escolher</span>
        </span>
        <span className="text-helper text-fg-muted">
          {formatosLegiveis} · até {maxSizeMb} MB
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={desabilitado}
          className="sr-only"
          onChange={(e) => {
            peneirar(e.target.files);
            // Zerar permite reescolher o MESMO arquivo depois de removê-lo da
            // fila — sem isso o `change` não dispara e nada acontece.
            e.target.value = "";
          }}
        />
      </label>

      {recusados.length > 0 && (
        <ul className="flex flex-col gap-1" role="alert">
          {recusados.map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-helper text-danger">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {arquivos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {arquivos.map((a) => {
            const ext = extensaoDe(a.file.name);
            const enviado = Math.round((a.progresso / 100) * a.file.size);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                {a.miniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element -- endereço local (blob:), o otimizador do Next não o lê
                  <img src={a.miniatura} alt="" aria-hidden="true" className="w-14 h-10 shrink-0 rounded-md border border-border object-cover bg-surface-2" />
                ) : (
                  <span
                    className="grid place-items-center w-9 h-9 shrink-0 rounded-md text-micro font-semibold text-white"
                    style={{ background: COR_POR_EXT[ext] ?? "var(--c41-fg-muted)" }}
                    aria-hidden="true"
                  >
                    {ext.slice(0, 4) || "?"}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <p className="truncate text-body text-fg" title={a.file.name}>
                    {a.file.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-helper text-fg-muted">
                    {a.estado === "enviando" ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        {formatarBytes(enviado)} de {formatarBytes(a.file.size)}
                      </>
                    ) : a.estado === "concluido" ? (
                      <>
                        <CheckCircle2 size={12} className="text-success-fg" />
                        Enviado · {formatarBytes(a.file.size)}
                      </>
                    ) : a.estado === "erro" ? (
                      <>
                        <AlertCircle size={12} className="text-danger" />
                        <span className="text-danger">{a.erro ?? "Falhou"}</span>
                      </>
                    ) : (
                      formatarBytes(a.file.size)
                    )}
                  </p>

                  {a.estado === "enviando" && (
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2"
                      role="progressbar"
                      aria-valuenow={a.progresso}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Enviando ${a.file.name}`}
                    >
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-200"
                        style={{ width: `${a.progresso}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Some durante o envio: cancelar no meio deixaria arquivo
                    parcial no servidor, e o que o botão faria não é óbvio. */}
                {a.estado !== "enviando" && (
                  <button
                    type="button"
                    onClick={() => onRemover(a.id)}
                    aria-label={`Remover ${a.file.name}`}
                    className="shrink-0 p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
                  >
                    <X size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
