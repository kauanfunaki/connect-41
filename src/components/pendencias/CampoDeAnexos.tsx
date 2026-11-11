"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { extensaoDe, formatarBytes, formatosDoAccept } from "@/lib/fileSize";
import { ACCEPT_DOS_ANEXOS, MAXIMO_DE_ANEXOS, TAMANHO_MAXIMO_DO_ANEXO } from "@/lib/financeiro/pendencias/anexo";
import { juntarAnexos } from "@/lib/financeiro/pendencias/juntarAnexos";

const REGRAS = { accept: ACCEPT_DOS_ANEXOS, maxBytes: TAMANHO_MAXIMO_DO_ANEXO, maximo: MAXIMO_DE_ANEXOS };
const LIMITE_EM_MB = Math.round(TAMANHO_MAXIMO_DO_ANEXO / (1024 * 1024));

/** O navegador deixa montar a lista do campo de arquivo (`DataTransfer`)? */
function montaLista(): boolean {
  try {
    return typeof DataTransfer === "function" && new DataTransfer().files !== undefined;
  } catch {
    return false;
  }
}

/**
 * Vários anexos num campo só, com `name="anexos"` — a action lê com `getAll`,
 * como antes.
 *
 * Até 11/11/2026 era um campo por arquivo e um toque em "Outro anexo" para
 * cada um a mais (P24 do polimento do portal): no celular, mandar três fotos
 * eram seis toques e três telas de escolha. Agora um campo `multiple`: cada
 * escolha soma às de antes (`juntarAnexos`), a lista mostra o que vai, e cada
 * arquivo sai com "Tirar". O `<input>` é o que o formulário submete: a lista
 * volta para ele a cada mudança, por `DataTransfer`. No navegador que não
 * deixa, vale a última escolha, e a lista mostra só ela — nunca algo que não
 * vai junto.
 *
 * O `id` do campo segue `${idBase}-0`, o que os rótulos (`htmlFor`) de quem
 * usa já apontam. A conferência de verdade (assinatura, tamanho) é no
 * servidor; o `accept` aqui só poupa a viagem.
 */
export function CampoDeAnexos({ idBase }: { idBase: string }) {
  const campo = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [recusados, setRecusados] = useState<string[]>([]);
  const [sobre, setSobre] = useState(false);
  const inputId = `${idBase}-0`;
  const ajudaId = `${idBase}-ajuda`;
  const cheio = arquivos.length >= MAXIMO_DE_ANEXOS;

  // O formulário limpo (o React 19 limpa o `<form action>` depois da ação, e
  // o `reset()` também) esvazia o campo: a lista acompanha, para nunca mostrar
  // arquivo que não vai junto.
  useEffect(() => {
    const form = campo.current?.form;
    if (!form) return;
    const limpar = () => {
      setArquivos([]);
      setRecusados([]);
    };
    form.addEventListener("reset", limpar);
    return () => form.removeEventListener("reset", limpar);
  }, []);

  function gravarNoCampo(lista: File[]) {
    if (!campo.current) return;
    const dt = new DataTransfer();
    for (const f of lista) dt.items.add(f);
    campo.current.files = dt.files;
  }

  function receber(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!montaLista()) {
      // Sem `DataTransfer`, o campo fica com a última escolha: a lista também.
      const r = juntarAnexos([], Array.from(files), REGRAS);
      if (r.recusados.length > 0 && campo.current) campo.current.value = "";
      setArquivos(r.recusados.length > 0 ? [] : r.arquivos);
      setRecusados(r.recusados);
      return;
    }
    const r = juntarAnexos(arquivos, Array.from(files), REGRAS);
    setArquivos(r.arquivos);
    setRecusados(r.recusados);
    gravarNoCampo(r.arquivos);
  }

  function tirar(indice: number) {
    const lista = arquivos.filter((_, i) => i !== indice);
    setArquivos(lista);
    setRecusados([]);
    if (montaLista()) gravarNoCampo(lista);
    else if (campo.current) campo.current.value = "";
    // O foco volta ao campo (o botão que sumiu levaria o foco para o topo).
    campo.current?.focus();
  }

  const formatos = formatosDoAccept(ACCEPT_DOS_ANEXOS);

  return (
    // `relative`: o <input> escondido (`sr-only`, absoluto) fica preso aqui.
    <div className="relative flex flex-col gap-2">
      {/* O campo vem antes do rótulo para o `peer-focus-visible` desenhar o
          foco do teclado na faixa — o campo em si é invisível. */}
      <input
        ref={campo}
        id={inputId}
        name="anexos"
        type="file"
        multiple
        accept={ACCEPT_DOS_ANEXOS}
        aria-describedby={ajudaId}
        tabIndex={cheio ? -1 : undefined}
        className="peer sr-only"
        onChange={(e) => receber(e.target.files)}
      />

      {cheio ? (
        <p id={ajudaId} className="text-helper text-fg-muted">
          Limite de {MAXIMO_DE_ANEXOS} arquivos por envio. Para trocar um, toque em Tirar.
        </p>
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
            receber(e.dataTransfer.files);
          }}
          className={`flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 cursor-pointer transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 ${
            sobre ? "border-brand bg-brand/5" : "border-border-strong bg-surface hover:border-brand hover:bg-surface-hover"
          }`}
        >
          <span
            aria-hidden
            className={`grid size-7 shrink-0 place-items-center rounded-full ${sobre ? "bg-brand/15 text-brand" : "bg-surface-2 text-fg-muted"}`}
          >
            <UploadCloud size={15} />
          </span>
          {/* Duas linhas, sem cortar: a ação em cima e os formatos embaixo —
              numa linha só, no celular, o limite sumia no "…". "Arraste" só
              com mouse; no toque, "Toque para escolher". */}
          <span className="min-w-0 flex-1">
            <span className="block text-ui text-fg">
              <span className="pointer-coarse:hidden">
                <span className="text-brand underline underline-offset-2">{arquivos.length > 0 ? "Escolher mais arquivos" : "Escolher arquivos"}</span> ou arraste aqui
              </span>
              <span className="hidden text-brand underline underline-offset-2 pointer-coarse:inline">
                {arquivos.length > 0 ? "Toque para escolher mais" : "Toque para escolher"}
              </span>
            </span>
            <span id={ajudaId} className="block text-helper text-fg-muted">
              {formatos} · até {LIMITE_EM_MB} MB cada · até {MAXIMO_DE_ANEXOS} arquivos
            </span>
          </span>
        </label>
      )}

      {arquivos.length > 0 && (
        <ul aria-label="Arquivos escolhidos" className="flex flex-col gap-1.5">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface py-1.5 pl-3 pr-1.5">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-brand/10 text-micro font-semibold uppercase text-brand">
                {extensaoDe(f.name).slice(0, 4) || "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui text-fg" data-dica={f.name}>
                  {f.name}
                </span>
                <span className="block text-helper text-fg-muted tabular-nums">{formatarBytes(f.size)}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => tirar(i)} aria-label={`Tirar ${f.name}`}>
                Tirar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {recusados.length > 0 && (
        <div role="alert" className="flex items-start gap-1.5 text-helper text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <ul className="flex flex-col gap-0.5">
            {recusados.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
