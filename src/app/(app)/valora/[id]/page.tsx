import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Building2, ClipboardList, MessageSquareText, Receipt } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EditarProposta } from "@/components/valora/EditarProposta";
import { acessoAoValora } from "@/lib/valora/servidor";
import { brl, horas, num } from "@/lib/valora/formato";
import { formatInstantDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { MODELO_41, ROTULO_REGIME, type ParametrosPreco, type Perfil, type Resultado } from "@/lib/valora/motor";

export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { rotulo: string; variante: "info" | "success" | "danger" }> = {
  ABERTA: { rotulo: "Em aberto", variante: "info" },
  GANHA: { rotulo: "Ganha", variante: "success" },
  PERDIDA: { rotulo: "Perdida", variante: "danger" },
};

const numero = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

/**
 * Uma proposta do Valora (revisão de 05/10/2026: o Kauan queria clicar na
 * linha e ver o que foi decidido). Três blocos:
 * - o retorno — situação, preços e o texto registrado em "Registrar retorno";
 * - o que a simulação considerou — regime, setores, volumes, situações do
 *   cliente e complexidades, como foram marcados no dia;
 * - o preço calculado no dia — foto: mudar parâmetros depois não reescreve.
 *
 * Custo de equipe é confidencial (como nos Parâmetros e no Diagnóstico): só
 * quem administra o setor vê o custo, total e por setor.
 */
export default async function PropostaDoValoraPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await acessoAoValora();
  if (!acesso) notFound();
  const { id } = await params;

  const p = await getPrisma().valoraProposta.findFirst({
    where: { id, tenantId: acesso.tenantId },
    select: {
      id: true,
      cliente: true,
      perfil: true,
      resultado: true,
      precoAlvo: true,
      precoOferecido: true,
      precoConcorrente: true,
      status: true,
      motivo: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      companyId: true,
    },
  });
  if (!p) notFound();

  const perfil = p.perfil as Perfil;
  const resultado = p.resultado as Resultado & { parametros?: ParametrosPreco };
  const alvo = numero(p.precoAlvo);
  const oferecido = numero(p.precoOferecido);
  const concorrente = numero(p.precoConcorrente);
  const empresa = p.companyId
    ? await getPrisma().company.findFirst({
        where: { id: p.companyId, tenantId: acesso.tenantId },
        select: { id: true, name: true, displayName: true },
      })
    : null;
  const situacao = SITUACAO[p.status] ?? { rotulo: p.status, variante: "info" as const };

  // Os rótulos vêm do catálogo do modelo: o que mudou nos Parâmetros não muda o
  // nome de um campo. Chave que o catálogo não conhece aparece como foi gravada.
  const rotuloDoCampo = (chave: string) => MODELO_41.campos.find((c) => c.chave === chave)?.rotulo ?? chave;
  const nomeDoSetor = (codigo: string) => MODELO_41.setores.find((s) => s.codigo === codigo)?.nome ?? codigo;
  const volumes = Object.entries(perfil.volumes ?? {}).filter(([, v]) => v > 0);
  const marcadores = Object.entries(perfil.marcadores ?? {})
    .filter(([, v]) => v)
    .map(([k]) => rotuloDoCampo(k));
  const complexidades = (perfil.complexidades ?? []).map((cid) => {
    const c = MODELO_41.complexidades.find((x) => x.id === cid);
    return c ? `${c.nome} (${nomeDoSetor(c.setor)}, +${c.pct}%)` : cid;
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title={p.cliente}
        subtitle={`Simulada em ${formatInstantDate(p.createdAt)} por ${p.createdBy.name} · ${ROTULO_REGIME[perfil.regime] ?? perfil.regime}`}
        meta={
          <>
            <Badge variant={situacao.variante}>{situacao.rotulo}</Badge>
            {p.updatedAt.getTime() - p.createdAt.getTime() > 60_000 && <span>atualizada em {formatInstantDate(p.updatedAt)}</span>}
          </>
        }
        action={
          acesso.podeSimular ? (
            <EditarProposta
              proposta={{ id: p.id, cliente: p.cliente, status: p.status, motivo: p.motivo, precoOferecido: oferecido, precoConcorrente: concorrente }}
            />
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <Card className="p-5 flex flex-col gap-4">
            <TituloDoCartao icone={<MessageSquareText size={16} />} titulo="Retorno do cliente" />
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-[13px]">
              <Dado rotulo="Situação">
                <Badge variant={situacao.variante}>{situacao.rotulo}</Badge>
              </Dado>
              <Dado rotulo="Preço oferecido">{brl(oferecido)}</Dado>
              <Dado rotulo="Oferecido ÷ alvo">{oferecido && alvo ? `${num((oferecido / alvo) * 100, 0)}%` : "—"}</Dado>
              <Dado rotulo="Preço do concorrente">{brl(concorrente)}</Dado>
            </dl>
            <div>
              <p className="text-[12px] font-medium text-fg-secondary mb-1">Motivo e observações</p>
              {p.motivo ? (
                <p className="text-[14px] leading-relaxed text-fg whitespace-pre-line">{p.motivo}</p>
              ) : (
                <p className="text-[13px] text-fg-muted">
                  Nada registrado ainda.{acesso.podeSimular ? " Use “Registrar retorno” para anotar o que o cliente disse." : ""}
                </p>
              )}
            </div>
            {empresa && (
              <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
                <Building2 size={14} className="text-fg-muted" /> Cliente no Connect:{" "}
                <Link href={`/empresas/${empresa.id}`} className="font-medium text-brand hover:underline">
                  {nomeExibicao(empresa)}
                </Link>
              </p>
            )}
          </Card>

          <Card className="p-5 flex flex-col gap-4">
            <TituloDoCartao icone={<ClipboardList size={16} />} titulo="O que a simulação considerou" />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
              <Dado rotulo="Regime">{ROTULO_REGIME[perfil.regime] ?? perfil.regime}</Dado>
              <Dado rotulo="Movimento">{perfil.semMovimento ? "Empresa sem movimento" : "Com movimento"}</Dado>
              <Dado rotulo="Setores contratados" largo>
                <span className="flex flex-wrap gap-1.5">
                  {perfil.setores.map((s) => (
                    <span key={s} className="inline-flex items-center h-6 px-2 rounded-full bg-surface-2 border border-border text-[12px] text-fg">
                      {nomeDoSetor(s)}
                    </span>
                  ))}
                </span>
              </Dado>
              <Dado rotulo="Volumes informados" largo>
                {volumes.length === 0 ? (
                  <span className="text-fg-muted">Nenhum</span>
                ) : (
                  <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                    {volumes.map(([k, v]) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="text-fg-secondary">{rotuloDoCampo(k)}</span>
                        <span className="tabular-nums font-medium">{num(v, 2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Dado>
              <Dado rotulo="Situações do cliente" largo>
                {marcadores.length === 0 ? <span className="text-fg-muted">Nenhuma marcada</span> : marcadores.join(" · ")}
              </Dado>
              <Dado rotulo="Complexidades" largo>
                {complexidades.length === 0 ? <span className="text-fg-muted">Nenhuma</span> : complexidades.join(" · ")}
              </Dado>
            </dl>
          </Card>
        </div>

        <Card className="p-5 flex flex-col gap-4 lg:sticky lg:top-4">
          <TituloDoCartao icone={<Receipt size={16} />} titulo="Preço calculado no dia" />
          <div>
            <p className="text-[12px] text-fg-secondary">Honorário mensal (alvo)</p>
            <p className="font-display text-[28px] font-semibold tabular-nums leading-tight">{brl(resultado.mensal?.alvo ?? alvo)}</p>
            {resultado.parametros && <p className="text-[12px] text-fg-muted">com {resultado.parametros.margemAlvoPct}% de margem</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Dado rotulo="Piso">{brl(resultado.mensal?.piso)}</Dado>
            <Dado rotulo="Tabela">{brl(resultado.mensal?.tabela)}</Dado>
            {acesso.podeGerir && <Dado rotulo="Custo">{brl(resultado.mensal?.custo)}</Dado>}
            <Dado rotulo="Horas/mês">{typeof resultado.horasMes === "number" ? horas(resultado.horasMes) : "—"}</Dado>
            <Dado rotulo="Implantação (uma vez)">{brl(resultado.implantacao?.alvo)}</Dado>
          </dl>
          {(resultado.setores?.length ?? 0) > 0 && (
            <div className="border-t border-border pt-3 flex flex-col gap-1.5 text-[13px]">
              {resultado.setores.map((s) => (
                <div key={s.codigo} className="flex justify-between gap-2">
                  <span>
                    {s.nome}
                    {s.complexidadePct > 0 && <span className="text-fg-muted"> +{s.complexidadePct}%</span>}
                  </span>
                  <span className="tabular-nums text-fg-secondary">
                    {horas(s.minutosMes / 60)}
                    {acesso.podeGerir && <> · {brl(s.custo)}</>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {(resultado.avisos?.length ?? 0) > 0 && (
            <ul className="flex flex-col gap-1 text-[12px] text-warning">
              {resultado.avisos.map((a) => (
                <li key={a} className="flex gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-fg-muted border-t border-border pt-3">
            É a foto do dia em que a proposta foi salva: mudar custos ou margem em Parâmetros não reescreve esta conta.
          </p>
        </Card>
      </div>
    </PageContainer>
  );
}

function TituloDoCartao({ icone, titulo }: { icone: React.ReactNode; titulo: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[length:var(--fs-card-title)] font-semibold text-fg">
      <span className="text-brand">{icone}</span>
      {titulo}
    </h2>
  );
}

function Dado({ rotulo, children, largo = false }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={`min-w-0 ${largo ? "sm:col-span-2" : ""}`}>
      <dt className="text-[12px] text-fg-secondary mb-0.5">{rotulo}</dt>
      <dd className="font-medium tabular-nums text-fg">{children}</dd>
    </div>
  );
}
