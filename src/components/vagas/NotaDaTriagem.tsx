import { Card } from "@/components/ui/Card";
import { formatInstantDateTime } from "@/lib/format";
import {
  FALHA_SEM_CURRICULO,
  ROTULO_DA_FAIXA,
  ROTULO_DO_VEREDITO,
  type AvaliacaoDeRequisito,
  type Faixa,
  type Requisito,
  type Veredito,
} from "@/lib/recrutamento/triagem";
import { PontuarCandidatura } from "./PontuarCandidatura";

export type NotaParaTela = {
  id: string;
  score: number;
  faixa: Faixa;
  resumo: string | null;
  avaliacoes: AvaliacaoDeRequisito[];
  versao: number;
  itens: Requisito[];
  createdAt: Date;
  origem: string;
};

const COR_DO_VEREDITO: Record<Veredito, string> = {
  SIM: "text-success",
  PARCIAL: "text-warning",
  NAO: "text-danger",
  SEM_EVIDENCIA: "text-fg-muted",
};

/**
 * A nota da triagem com o porquê de cada requisito. É o que permite explicar
 * — e contestar — qualquer nota: o candidato tem direito a pedir revisão de
 * decisão automatizada (LGPD, art. 20), e a resposta sai desta tabela.
 */
export function NotaDaTriagem({
  vagaId,
  candidaturaId,
  notas,
  versaoAtual,
  podePontuar,
  falha,
}: {
  vagaId: string;
  candidaturaId: string;
  notas: NotaParaTela[];
  versaoAtual: number | null;
  podePontuar: boolean;
  /** Última falha da pontuação (automática ou não) — o cron não tenta de novo enquanto ela existir. */
  falha: string | null;
}) {
  const [ultima, ...anteriores] = notas;
  return (
    <Card className="p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Triagem do currículo</h2>
          <p className="text-[12px] text-fg-muted mt-0.5">A nota só ordena os candidatos da vaga — quem avança ou reprova é o recrutador.</p>
        </div>
        {podePontuar && versaoAtual !== null && (
          <PontuarCandidatura vagaId={vagaId} candidaturaId={candidaturaId} rotulo={ultima ? "Pontuar de novo" : "Pontuar agora"} />
        )}
      </div>

      {!ultima ? (
        <p className="text-[13px] text-fg-muted">
          {versaoAtual === null ? "A vaga ainda não tem requisitos de triagem." : "Ainda sem nota nesta candidatura."}
          {falha === FALHA_SEM_CURRICULO && versaoAtual !== null ? (
            // Currículo é opcional no portal: não é erro do sistema, é o que a
            // candidatura tem. Dizer "falhou" fazia parecer defeito.
            <span className="block text-fg-secondary mt-1">
              O candidato não enviou currículo em PDF, então não há o que pontuar. Quando o currículo chegar, use o botão.
            </span>
          ) : (
            falha &&
            versaoAtual !== null && (
              <span className="block text-warning mt-1">
                A pontuação falhou: {falha} A pontuação automática não tenta de novo — use o botão depois de resolver.
              </span>
            )
          )}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-3 mb-2">
            <span className="text-[28px] font-semibold tnum leading-none">{ultima.score}</span>
            <span className="text-[13px] font-medium">{ROTULO_DA_FAIXA[ultima.faixa]}</span>
            <span className="text-[11px] text-fg-muted">
              requisitos v{ultima.versao}
              {versaoAtual !== null && ultima.versao !== versaoAtual && " (versão anterior — pontue de novo)"} · {formatInstantDateTime(ultima.createdAt)}
            </span>
          </div>
          {ultima.resumo && <p className="text-[13px] text-fg-secondary mb-3">{ultima.resumo}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Requisito</th>
                  <th className="py-2 pr-3 font-medium">Veredito</th>
                  <th className="py-2 font-medium">Evidência no currículo</th>
                </tr>
              </thead>
              <tbody>
                {ultima.itens.map((r) => {
                  const a = ultima.avaliacoes.find((x) => x.requisitoId === r.id);
                  const v: Veredito = a?.veredito ?? "SEM_EVIDENCIA";
                  return (
                    <tr key={r.id} className="border-b border-border-soft align-top">
                      <td className="py-1.5 pr-3">
                        {r.texto}
                        <span className="block text-[11px] text-fg-muted">
                          {r.tipo === "OBRIGATORIO" ? "obrigatório" : "desejável"} · peso {r.peso}
                        </span>
                      </td>
                      <td className={`py-1.5 pr-3 font-medium ${COR_DO_VEREDITO[v]}`}>{ROTULO_DO_VEREDITO[v]}</td>
                      <td className="py-1.5 text-fg-secondary">{a?.evidencia || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {anteriores.length > 0 && (
            <details className="mt-3">
              <summary className="text-[12px] text-fg-muted cursor-pointer">Notas anteriores ({anteriores.length})</summary>
              <ul className="mt-1.5 space-y-0.5 text-[12px] text-fg-secondary">
                {anteriores.map((n) => (
                  <li key={n.id} className="tnum">
                    {n.score} · {ROTULO_DA_FAIXA[n.faixa]} · requisitos v{n.versao} · {formatInstantDateTime(n.createdAt)}
                    {n.origem === "LOTE" && " · em lote"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
