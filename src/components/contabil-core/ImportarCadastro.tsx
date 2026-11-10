"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Aviso } from "@/components/ui/Aviso";
import { Badge, type VarianteDoBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";

// Importação de cadastros por planilha (Fase 3b, 10/11/2026). Regras e contrapartes passam por
// prévia: o servidor lê o arquivo, mostra o que entraria e devolve um comprovante; "Importar" manda
// o MESMO arquivo de novo com o comprovante, e o servidor refaz a análise antes de gravar. O plano de
// contas é importado direto, como no original, e devolve o que entrou e o que foi recusado por linha.

type Previa = {
  totalLinhas: number;
  prontas: number;
  duplicadas: number;
  conflitos: number;
  invalidas: number;
  avisos: string[];
  comprovante: string;
  colunas: string[];
  itens: { linha: number; status: string; motivo: string | null; valores: string[] }[];
};
type ResultadoDoPlano = { importadas: number; atualizadas: number; duplicadas: number; erros: { linha: number; codigo: string | null; erro: string }[] };

const STATUS: Record<string, { rotulo: string; variante: VarianteDoBadge }> = {
  pronta: { rotulo: "Pronta", variante: "success" },
  duplicada: { rotulo: "Já existe", variante: "neutral" },
  conflito: { rotulo: "Conflito", variante: "warning" },
  invalida: { rotulo: "Inválida", variante: "danger" },
};

const TEXTOS = {
  regras: { botao: "Importar regras", titulo: "Importar regras por planilha", arquivo: "Modelo de regras (.xlsx ou .xls)", aceita: ".xlsx,.xls" },
  contrapartes: { botao: "Importar relação fiscal", titulo: "Importar relação de clientes ou fornecedores", arquivo: "Relação fiscal (.xlsx ou .xls)", aceita: ".xlsx,.xls" },
  plano: { botao: "Importar plano", titulo: "Importar plano de contas", arquivo: "Plano de contas (.xlsx ou .csv)", aceita: ".xlsx,.xls,.csv" },
} as const;

export function ImportarCadastro({ tipo, empresaId, agencias }: { tipo: keyof typeof TEXTOS; empresaId: string; agencias?: Opcao[] }) {
  const base = useId();
  const textos = TEXTOS[tipo];
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [banco, setBanco] = useState("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [plano, setPlano] = useState<ResultadoDoPlano | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();
  const toast = useToast();

  function fechar() {
    setAberto(false);
    setPrevia(null);
    setPlano(null);
    setErro(null);
    setArquivo(null);
  }

  async function enviar(acao: "analisar" | "confirmar" | "importar") {
    const f = acao === "confirmar" ? arquivo : arquivoRef.current?.files?.[0];
    setErro(null);
    if (!f) return setErro("Escolha o arquivo.");
    const form = new FormData();
    form.set("tipo", tipo);
    form.set("acao", acao);
    form.set("empresaId", empresaId);
    form.set("arquivo", f);
    form.set("banco", banco);
    if (acao === "confirmar" && previa) form.set("comprovante", previa.comprovante);
    setEnviando(true);
    const resp = await fetch("/api/contabil-core/cadastros", { method: "POST", body: form }).catch(() => null);
    setEnviando(false);
    const corpo = (await resp?.json().catch(() => null)) as { error?: string; previa?: Previa; resultado?: { importadas: number }; plano?: ResultadoDoPlano } | null;
    if (!resp?.ok || !corpo) {
      if (acao === "confirmar") setPrevia(null);
      return setErro(corpo?.error ?? "Não deu para enviar o arquivo. Tente de novo.");
    }
    if (acao === "analisar" && corpo.previa) {
      setArquivo(f);
      setPrevia(corpo.previa);
      return;
    }
    if (acao === "importar" && corpo.plano) {
      setPlano(corpo.plano);
      if (corpo.plano.importadas || corpo.plano.atualizadas) router.refresh();
      return;
    }
    toast.success(`${corpo.resultado?.importadas ?? 0} cadastro(s) importado(s).`);
    fechar();
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setAberto(true)}>
        <FileSpreadsheet size={14} aria-hidden /> {textos.botao}
      </Button>
      <Modal open={aberto} onClose={fechar} title={textos.titulo} maxWidth="max-w-5xl">
        <div className="flex flex-col gap-4">
          {!previa && !plano && (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <CampoForm label={textos.arquivo} htmlFor={`${base}-arq`} required>
                <input id={`${base}-arq`} ref={arquivoRef} type="file" accept={textos.aceita} className="block w-full text-sm" />
              </CampoForm>
              {tipo === "regras" ? (
                <CampoForm label="Banco das regras" htmlFor={`${base}-banco`} helper="A escolha vale para todas as linhas.">
                  <SearchableSelect
                    id={`${base}-banco`}
                    name="banco"
                    options={[{ value: "arquivo", label: "Coluna BANCO do arquivo" }, { value: "todos", label: "Todos os bancos" }, ...(agencias ?? [])]}
                    defaultValue={banco}
                    onChange={setBanco}
                  />
                </CampoForm>
              ) : (
                <div />
              )}
              <Button type="button" onClick={() => enviar(tipo === "plano" ? "importar" : "analisar")} loading={enviando} loadingLabel="Lendo…">
                {tipo === "plano" ? "Importar" : "Ver prévia"}
              </Button>
            </div>
          )}

          {erro && (
            <p role="alert" className="text-helper text-danger">
              {erro}
            </p>
          )}

          {previa && (
            <>
              <p className="text-sm">
                {previa.totalLinhas} linha(s): <strong>{previa.prontas} pronta(s)</strong>, {previa.duplicadas} já existe(m), {previa.conflitos} em conflito,{" "}
                {previa.invalidas} inválida(s). Só as prontas entram.
              </p>
              {previa.avisos.length > 0 && (
                <Aviso tom="atencao">
                  <ul className="list-disc pl-4">
                    {previa.avisos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </Aviso>
              )}
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-fg-muted">
                      <th className="py-2 pr-3 font-medium">Linha</th>
                      <th className="py-2 pr-3 font-medium">Situação</th>
                      {previa.colunas.map((c) => (
                        <th key={c} className="py-2 pr-3 font-medium">
                          {c}
                        </th>
                      ))}
                      <th className="py-2 font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.itens.map((i) => (
                      <tr key={i.linha} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-3 tabular-nums">{i.linha}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={STATUS[i.status]?.variante ?? "neutral"}>{STATUS[i.status]?.rotulo ?? i.status}</Badge>
                        </td>
                        {i.valores.map((v, k) => (
                          <td key={k} className="py-2 pr-3">
                            {v}
                          </td>
                        ))}
                        <td className="py-2 text-fg-muted">{i.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setPrevia(null)} disabled={enviando}>
                  Escolher outro arquivo
                </Button>
                <Button type="button" onClick={() => enviar("confirmar")} loading={enviando} disabled={!previa.prontas}>
                  Importar {previa.prontas} pronta(s)
                </Button>
              </div>
            </>
          )}

          {plano && (
            <>
              <Aviso tom={plano.erros.length ? "atencao" : "sucesso"}>
                <p>
                  {plano.importadas} conta(s) criada(s), {plano.atualizadas} atualizada(s), {plano.duplicadas} já existia(m), {plano.erros.length} linha(s) recusada(s).
                </p>
              </Aviso>
              {plano.erros.length > 0 && (
                <ul className="max-h-[40vh] overflow-auto text-sm">
                  {plano.erros.map((e, k) => (
                    <li key={k} className="border-b border-border/60 py-1">
                      Linha {e.linha}
                      {e.codigo ? ` (${e.codigo})` : ""}: {e.erro}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <Button type="button" onClick={fechar}>
                  Fechar
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
