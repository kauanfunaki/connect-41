import Link from "next/link";
import { Landmark, PauseCircle, RotateCcw, Timer, Hourglass } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RegistrarCobranca } from "@/components/societario/RegistrarCobranca";
import { visaoPorOrgao, protocolosDoOrgao } from "@/lib/societario/painelDoSetorServidor";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const dias = (n: number | null) => (n === null ? "—" : formatarNumero(n, 1));

/**
 * A visão por órgão (04/11/2026, lote D dos ajustes de 03/11 — escolha A da
 * página de opções): uma linha por órgão, com quantos protocolos esperam,
 * quantos estão parados, quanto ele costuma levar para responder e quantas
 * voltas dá por protocolo. "Ver protocolos" abre a lista daquele órgão aqui
 * mesmo. Responde "onde os processos travam".
 */
export default async function OrgaosPage({ searchParams }: { searchParams: Promise<{ orgao?: string }> }) {
  const { ctx } = await abrirTelaDoModulo("societario_orgaos");
  const tenantId = ctx.tenantId!;
  const { orgao } = await searchParams;
  const agora = new Date();
  const [{ linhas, prazoDoParado }, podeAgir] = await Promise.all([visaoPorOrgao(tenantId, agora), podeNoModulo(ctx, "societario_prazos", "agir")]);
  const escolhido = orgao ? linhas.find((l) => l.id === orgao) ?? null : null;
  const protocolos = escolhido ? await protocolosDoOrgao(tenantId, escolhido.id, agora) : [];

  const esperando = linhas.reduce((s, l) => s + l.esperando, 0);
  const parados = linhas.reduce((s, l) => s + l.parados, 0);
  const comResposta = linhas.filter((l) => l.respostaMediaDias !== null);
  const media = comResposta.length ? comResposta.reduce((s, l) => s + l.respostaMediaDias!, 0) / comResposta.length : null;

  return (
    <PageContainer>
      <PageHeader
        title="Órgãos"
        subtitle="Onde os processos esperam: protocolos em cada órgão, há quanto tempo e quanto ele costuma levar para responder. Resposta média e voltas contam os últimos 90 dias."
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Protocolos esperando", valor: formatarNumero(esperando, 0), icone: <Hourglass /> },
          { rotulo: `Parados (${prazoDoParado}+ dias)`, valor: formatarNumero(parados, 0), tom: parados > 0 ? "text-danger" : undefined, icone: <PauseCircle />, href: "/exigencias?aba=parados" },
          { rotulo: "Resposta média", valor: media === null ? "—" : `${formatarNumero(media, 1)} dias`, icone: <Timer /> },
          { rotulo: "Órgãos com protocolo", valor: formatarNumero(linhas.length, 0), icone: <Landmark /> },
        ]}
      />

      <Card as="section" aria-labelledby="tabela-orgaos" className="p-4 flex flex-col gap-3">
        <h2 id="tabela-orgaos" className="sr-only">
          Órgãos
        </h2>
        {linhas.length === 0 ? (
          <EmptyState icon={<Landmark />} title="Nenhum protocolo nos últimos 90 dias" description="Os órgãos aparecem aqui quando um processo é protocolado neles." />
        ) : (
          <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  {["Órgão", "Esperando", "Parados", "Resposta média (dias)", "Voltas por protocolo", "Última resposta", ""].map((c, i) => (
                    <th key={i} className="px-3 py-2">
                      {c || <span className="sr-only">Ações</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={`border-b border-border-soft tabular-nums ${escolhido?.id === l.id ? "bg-brand/5" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{l.nome}</td>
                    <td className="px-3 py-2">{l.esperando}</td>
                    <td className={`px-3 py-2 ${l.parados > 0 ? "text-danger font-medium" : ""}`}>{l.parados}</td>
                    <td className="px-3 py-2">{dias(l.respostaMediaDias)}</td>
                    <td className="px-3 py-2">{dias(l.voltasPorProtocolo)}</td>
                    <td className="px-3 py-2">{l.ultimaResposta ? formatInstantDate(l.ultimaResposta) : "—"}</td>
                    <td className="px-3 py-2">
                      {l.esperando > 0 && (
                        <Button href={escolhido?.id === l.id ? "/processos/orgaos" : `/processos/orgaos?orgao=${l.id}#protocolos`} variant="secondary" size="sm">
                          {escolhido?.id === l.id ? "Fechar" : "Ver protocolos"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {escolhido && (
        <Card as="section" id="protocolos" aria-labelledby="protocolos-do-orgao" className="mt-5 p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="protocolos-do-orgao" className="text-section font-semibold text-fg">
              {escolhido.nome}
            </h2>
            <span className="text-fs-2 text-fg-muted">
              {escolhido.esperando} esperando · resposta média {dias(escolhido.respostaMediaDias)} dias
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-border-soft">
            {protocolos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <Link href={`/processos/${p.processoId}`} className="block font-semibold text-fg transition-colors hover:text-brand">
                    {p.processo}
                  </Link>
                  <span className="block text-fs-2 text-fg-muted tabular-nums">
                    {p.empresa} · {p.numero ? `nº ${p.numero} · ` : ""}protocolado em {formatInstantDate(p.protocoladoEm)}
                    {p.tentativa > 1 && ` · ${p.tentativa}ª apresentação`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Selo tom={p.dias >= prazoDoParado ? "perigo" : "neutro"}>{p.dias} dias</Selo>
                  {podeAgir && p.dias >= prazoDoParado && <RegistrarCobranca protocoloId={p.id} />}
                </span>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-1.5 text-micro text-fg-muted">
            <RotateCcw size={12} aria-hidden /> Os parados ({prazoDoParado}+ dias) também estão em Exigências › Protocolos parados.
          </p>
        </Card>
      )}
    </PageContainer>
  );
}
