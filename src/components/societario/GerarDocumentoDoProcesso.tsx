"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { LUGARES, PAPEL_DO_LUGAR, ROTULO_DO_LUGAR, ROTULO_DO_TIPO, type Lugar, type PapelDoParticipante, type TipoDeModelo } from "@/lib/societario/modelos/campos";
import { camposEmBrancoDoModelo, definirQuemAssinaNoProcesso, gerarDocumentoDoModelo } from "@/app/(app)/processos/modelos/actions";
import { baixarDocx } from "./baixarDocx";

type Props = {
  processId: string;
  modelos: { id: string; tipo: TipoDeModelo; nome: string }[];
  participantes: { id: string; papel: PapelDoParticipante; nome: string }[];
  escolhidos: Record<Lugar, string | null>;
  historico: { id: string; nomeArquivo: string; modelo: string | null; geradoPor: string; geradoEm: string; nosArquivos: boolean }[];
  /** Quem coordena: o link para a tela dos modelos aparece. */
  podeGerirModelos: boolean;
  podeAgir: boolean;
};

const TITULO_ID = "gerar-documento";

/**
 * "Gerar documento" no processo (27/11/2026, funcionalidade-891): escolhe o
 * modelo do escritório, quem assina como advogado e testemunhas, e baixa o
 * .docx preenchido com o cadastro de agora. O documento vai também para os
 * Arquivos da empresa (pasta Societário), e não para os documentos do processo,
 * que o cliente vê: é rascunho para a equipe revisar.
 *
 * O cartão aparece sempre: sem modelo, diz onde enviar (o campo pedido não
 * some, para a equipe saber que existe).
 */
export function GerarDocumentoDoProcesso({ processId, modelos, participantes, escolhidos, historico, podeGerirModelos, podeAgir }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? "");
  const [quem, setQuem] = useState<Record<Lugar, string | null>>(escolhidos);
  const [emBranco, setEmBranco] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, iniciar] = useTransition();

  // O que vai sair em branco com o modelo escolhido — o aviso antes de gerar.
  useEffect(() => {
    if (!modeloId || !podeAgir) return;
    let vale = true;
    camposEmBrancoDoModelo(processId, modeloId, quem)
      .then((r) => vale && setEmBranco(r.ok ? r.emBranco : null))
      .catch(() => vale && setEmBranco(null));
    return () => {
      vale = false;
    };
  }, [processId, modeloId, podeAgir, quem]);

  const mudouQuem = LUGARES.some((l) => (quem[l] ?? null) !== (escolhidos[l] ?? null));

  function gerar() {
    setErro(null);
    iniciar(async () => {
      try {
        if (mudouQuem) {
          const salvo = await definirQuemAssinaNoProcesso(processId, quem);
          if (!salvo.ok) return setErro(salvo.erro);
        }
        const r = await gerarDocumentoDoModelo(processId, modeloId);
        if (!r.ok) return setErro(r.erro);
        baixarDocx(r.nomeArquivo, r.conteudoBase64);
        toast.success(r.guardadoNosArquivos ? "Documento gerado e guardado nos Arquivos da empresa." : "Documento gerado.");
        router.refresh();
      } catch {
        setErro("Não deu para gerar agora. Tente de novo.");
      }
    });
  }

  const opcoesDoLugar = (l: Lugar) => participantes.filter((p) => p.papel === PAPEL_DO_LUGAR[l] && LUGARES.every((o) => o === l || quem[o] !== p.id));

  return (
    <Card as="section" aria-labelledby={TITULO_ID} className="p-4 flex flex-col gap-4">
      <h2 id={TITULO_ID} className="text-section font-semibold text-fg">
        Gerar documento
      </h2>

      {modelos.length === 0 ? (
        <Aviso tom="neutro">
          {podeGerirModelos ? (
            <>
              Ainda não há modelo de documento.{" "}
              <Link href="/processos/modelos" className="text-brand underline">
                Envie o .docx do contrato ou da alteração
              </Link>{" "}
              com os campos entre chaves.
            </>
          ) : (
            "Ainda não há modelo de documento. Peça à coordenação do Societário para enviar o .docx em Processos › Modelos de documento."
          )}
        </Aviso>
      ) : (
        <>
          <CampoForm label="Modelo" htmlFor="gerar-modelo">
            <Select id="gerar-modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)} disabled={!podeAgir}>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} · {ROTULO_DO_TIPO[m.tipo]}
                </option>
              ))}
            </Select>
          </CampoForm>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-1">
            {LUGARES.map((l) => (
              <CampoForm key={l} label={ROTULO_DO_LUGAR[l]} htmlFor={`gerar-${l}`}>
                <Select
                  id={`gerar-${l}`}
                  value={quem[l] ?? ""}
                  onChange={(e) => setQuem((q) => ({ ...q, [l]: e.target.value || null }))}
                  disabled={!podeAgir}
                >
                  <option value="">Ninguém</option>
                  {opcoesDoLugar(l).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            ))}
          </div>
          {participantes.length === 0 && podeGerirModelos && (
            <p className="text-helper text-fg-muted">
              Sem advogado ou testemunha cadastrados.{" "}
              <Link href="/processos/modelos" className="text-brand underline">
                Cadastrar
              </Link>
            </p>
          )}

          {emBranco && emBranco.length > 0 && (
            <Aviso tom="atencao">
              Sai em branco, por falta no cadastro: {emBranco.join(", ")}. Dá para gerar assim e completar no Word, ou corrigir antes na ficha da empresa.
            </Aviso>
          )}
          {erro && <Aviso>{erro}</Aviso>}

          {podeAgir && (
            <div>
              <Button onClick={gerar} loading={gerando} loadingLabel="Gerando…" disabled={!modeloId}>
                <FileDown size={14} aria-hidden /> Gerar e baixar
              </Button>
            </div>
          )}
        </>
      )}

      {historico.length > 0 && (
        <BlocoRecolhivel titulo="Gerados neste processo" resumo={`${historico.length} ${historico.length === 1 ? "documento" : "documentos"}`}>
          <ul className="flex flex-col gap-2 text-fs-2">
            {historico.map((h) => (
              <li key={h.id} className="flex items-start gap-2">
                <FileText size={14} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="break-all text-fg">{h.nomeArquivo}</span>
                  <span className="block text-fg-muted">
                    {h.geradoEm} · {h.geradoPor}
                    {h.modelo ? ` · ${h.modelo}` : " · modelo excluído"}
                    {h.nosArquivos ? " · nos Arquivos" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </BlocoRecolhivel>
      )}
    </Card>
  );
}
