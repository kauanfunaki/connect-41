"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Camera, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoData } from "@/components/ui/CampoData";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatCnpj, formatCpf, formatarReais } from "@/lib/format";
import type { MudancaNoQuadro, SocioNaFoto } from "@/lib/societario/quadro";
import { excluirQuadroSocietario, guardarQuadroSocietario } from "@/app/(app)/empresas/[id]/socios/dados-actions";

export type QuadroNaLista = {
  id: string;
  data: string;
  capitalSocial: number | null;
  socios: SocioNaFoto[];
  origem: "MANUAL" | "PROCESSO";
  processo: { href: string; numero: number } | null;
  registradoPor: string;
  mudancas: MudancaNoQuadro[] | null;
};

type Props = {
  companyId: string;
  quadros: QuadroNaLista[];
  /** "aaaa-mm-dd" de hoje em São Paulo, para o campo. */
  hoje: string;
  podeGuardar: boolean;
  podeExcluir: boolean;
  temSocios: boolean;
};

const INTEIRO = new Intl.NumberFormat("pt-BR");
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

function documento(d: string | null) {
  if (!d) return null;
  return d.length === 11 ? formatCpf(d) : d.length === 14 ? formatCnpj(d) : d;
}

function resumoDasMudancas(m: MudancaNoQuadro[] | null): string {
  if (m === null) return "Primeiro quadro guardado";
  if (m.length === 0) return "Sem mudança de sócio";
  const de = (tipo: MudancaNoQuadro["tipo"]) => m.filter((x) => x.tipo === tipo).map((x) => x.nome);
  return [
    de("entrou").length > 0 ? `entrou ${de("entrou").join(", ")}` : null,
    de("saiu").length > 0 ? `saiu ${de("saiu").join(", ")}` : null,
    de("mudou").length > 0 ? `mudou a participação de ${de("mudou").join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * O quadro societário por data (27/11/2026, melhoria-892): a foto dos sócios e
 * do capital depois de cada ato. Guarda-se aqui, com a data do ato, ou no
 * processo, ao registrar na Junta. Cada foto começa fechada, com o resumo do
 * que mudou na linha.
 */
export function QuadroSocietarioPorData({ companyId, quadros, hoje, podeGuardar, podeExcluir, temSocios }: Props) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  function guardar() {
    setErro(null);
    iniciar(async () => {
      const r = await guardarQuadroSocietario(companyId, data).catch(() => ({ ok: false as const, erro: "Não deu para guardar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Quadro guardado.");
      setAberto(false);
    });
  }

  function excluir(q: QuadroNaLista) {
    requestConfirm(
      { title: `Excluir o quadro de ${q.data}?`, description: "A foto sai do histórico. Os sócios cadastrados não mudam.", confirmLabel: "Excluir", destructive: true },
      async () => {
        const r = await excluirQuadroSocietario(companyId, q.id);
        return r.ok ? null : { error: r.erro };
      }
    );
  }

  const tituloId = "quadro-por-data";
  return (
    <Card as="section" aria-labelledby={tituloId} className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={tituloId} className="text-section font-semibold text-fg">
          Quadro societário por data
        </h2>
        {podeGuardar && temSocios && (
          <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
            <Camera size={13} aria-hidden /> Guardar o quadro de hoje
          </Button>
        )}
      </div>

      {quadros.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="Nenhum quadro guardado"
          description="Guarde a foto dos sócios depois de cada alteração, com a data do ato. No processo, isso acontece ao registrar o NIRE em “Registro na Junta”."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {quadros.map((q) => (
            <li key={q.id}>
              <BlocoRecolhivel
                titulo={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{q.data}</span>
                    {q.origem === "PROCESSO" && <Selo tom="marca">Registro na Junta</Selo>}
                  </span>
                }
                resumo={`${q.socios.length} ${q.socios.length === 1 ? "sócio" : "sócios"}${q.capitalSocial !== null ? ` · ${formatarReais(q.capitalSocial)}` : ""} · ${resumoDasMudancas(q.mudancas)}`}
              >
                <div className="flex flex-col gap-2 text-fs-2">
                  <ul className="flex flex-col gap-1">
                    {q.socios.map((s, i) => (
                      <li key={i} className="text-fg">
                        <span className="font-medium">{s.nome}</span>
                        <span className="text-fg-muted">
                          {[
                            s.administrador ? " · administrador" : null,
                            documento(s.documento) ? ` · ${documento(s.documento)}` : null,
                            s.percentual !== null ? ` · ${PERCENTUAL.format(s.percentual)}%` : null,
                            s.quotas !== null ? ` · ${INTEIRO.format(s.quotas)} quotas` : null,
                            s.capital !== null ? ` · ${formatarReais(s.capital)}` : null,
                          ]
                            .filter(Boolean)
                            .join("")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-fg-muted">
                    Guardado por {q.registradoPor}
                    {q.processo && (
                      <>
                        {" "}
                        no{" "}
                        <Link href={q.processo.href} className="text-brand underline">
                          processo {q.processo.numero}
                        </Link>
                      </>
                    )}
                    .
                  </p>
                  {podeExcluir && (
                    <div>
                      <Button variant="ghost" size="xs" onClick={() => excluir(q)}>
                        <Trash2 size={11} aria-hidden /> Excluir este quadro
                      </Button>
                    </div>
                  )}
                </div>
              </BlocoRecolhivel>
            </li>
          ))}
        </ul>
      )}

      <Modal open={aberto} onClose={() => !guardando && setAberto(false)} title="Guardar o quadro societário" maxWidth="max-w-md">
        <div className="flex flex-col gap-4">
          <p className="text-fs-2 text-fg-secondary">Guarda os sócios que estão cadastrados agora, com a participação, as quotas e o capital, na data do ato.</p>
          <CampoForm label="Data do ato" htmlFor="quadro-data" dica="A data do registro da alteração na Junta.">
            <CampoData id="quadro-data" value={data} onChange={setData} max={hoje} />
          </CampoForm>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={guardando} loadingLabel="Guardando…" disabled={!data}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
      {dialog}
    </Card>
  );
}
