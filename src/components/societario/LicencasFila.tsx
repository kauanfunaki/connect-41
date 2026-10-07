import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate } from "@/lib/format";
import {
  situacaoDaLicenca,
  diasAte,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
} from "@/lib/societario/licencas";
import { campoDaData } from "@/lib/societario/datas";
import type { LinhaDeLicenca } from "@/lib/societario/licencas-data";
import { AcoesDaLicenca } from "./AcoesDaLicenca";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { saoPauloParts } from "@/lib/agenda";
import type { OrgaoDaLicenca } from "./LicencaForm";
import { TOM_DA_VARIANTE } from "./tomDoSelo";

type Props = {
  linhas: LinhaDeLicenca[];
  /** Hoje, do servidor — o relógio do navegador pode estar noutro fuso. */
  hoje: Date;
  filtrado: boolean;
  orgaos: OrgaoDaLicenca[];
};

/**
 * Quanto falta, em palavras.
 *
 * "Vence em 12 dias" é acionável; "18/09/2026" obriga quem lê a fazer a conta —
 * e é a conta que a fila existe para poupar.
 */
function prazoEmPalavras(expiresAt: Date | null, hoje: Date): string | null {
  if (!expiresAt) return null;
  const dias = diasAte(expiresAt, hoje);
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 0) return `vence em ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  return `venceu há ${Math.abs(dias)} dias`;
}

/**
 * A fila de licenças: tabela no computador, cartões no celular (07/10/2026) —
 * era a única fila do Societário, com a de exigências, que rolava de lado no
 * celular (`min-w-[920px]`).
 */
export function LicencasFila({ linhas, hoje, filtrado, orgaos }: Props) {
  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nada neste recorte"
        description="Troque o filtro acima para ver as outras."
        icon={<ShieldCheck />}
      />
    ) : (
      <EmptyState
        title="Nenhuma licença cadastrada"
        description="Alvará, licença sanitária, ambiental, bombeiros — o que fica valendo depois que o processo fecha, e cuja validade gera a próxima renovação. Cadastre em “Nova licença”."
        icon={<ShieldCheck />}
      />
    );
  }

  const paraEditar = (l: LinhaDeLicenca) => ({
    id: l.id,
    companyId: l.companyId,
    empresaNome: l.empresaNome,
    kind: l.kind,
    organId: l.organId,
    number: l.number,
    issuedAt: campoDaData(l.issuedAt),
    expiresAt: campoDaData(l.expiresAt),
    notes: l.notes,
    revogada: l.revokedAt !== null,
  });

  // O link da célula principal no desenho da fila de processos: negrito, cor
  // do texto e azul só no hover (07/10/2026 — eram quatro desenhos no módulo).
  const linkDaEmpresa = (l: LinhaDeLicenca) => (
    <Link href={`/empresas/${l.companyId}`} className="font-semibold text-fg hover:text-brand transition-colors">
      {l.empresaNome}
    </Link>
  );

  return (
    <>
      <CartoesNoCelular>
        {linhas.map((l) => {
          const situacao = situacaoDaLicenca(l, hoje);
          const prazo = prazoEmPalavras(l.expiresAt, hoje);
          return (
            <Cartao key={l.id}>
              <TopoDoCartao
                nome={linkDaEmpresa(l)}
                valor={l.expiresAt ? formatInstantDate(l.expiresAt) : <span className="font-normal text-fg-muted">não vence</span>}
              />
              <InfoDoCartao>
                {l.kind}
                {l.orgaoNome ? ` · ${l.orgaoNome}` : ""}
                {l.number ? ` · nº ${l.number}` : ""}
              </InfoDoCartao>
              {prazo && <InfoDoCartao>{prazo}</InfoDoCartao>}
              <PeDoCartao>
                <Selo tom={TOM_DA_VARIANTE[SITUACAO_VARIANTE[situacao]]}>{SITUACAO_LABEL[situacao]}</Selo>
                <div className="ml-auto">
                  <AcoesDaLicenca orgaos={orgaos} licenca={paraEditar(l)} />
                </div>
              </PeDoCartao>
            </Cartao>
          );
        })}
      </CartoesNoCelular>

      <TabelaFiltravel
        linhas={linhas.map((l) => ({
          id: l.id,
          valores: {
            empresa: l.empresaNome,
            licenca: l.kind,
            orgao: l.orgaoNome ?? "",
            validade: l.expiresAt ? saoPauloParts(l.expiresAt).dateKey : "",
            situacao: SITUACAO_LABEL[situacaoDaLicenca(l, hoje)],
          },
        }))}
      >
        <TabelaNoDesktop padrao>
          <table className="w-full min-w-[920px] text-[length:var(--fs-ui)]">
            <thead>
              <tr className="text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Empresa" chave="empresa" /></th>
                <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Licença" chave="licenca" /></th>
                <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Órgão" chave="orgao" /></th>
                <th className="py-2 pr-3 font-medium">Número</th>
                <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Validade" chave="validade" tipo="data" /></th>
                <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Situação" chave="situacao" align="right" /></th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const situacao = situacaoDaLicenca(l, hoje);
                const prazo = prazoEmPalavras(l.expiresAt, hoje);
                return (
                  <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 pr-3">{linkDaEmpresa(l)}</td>
                    <td className="py-2.5 pr-3 text-fg-secondary">
                      {l.kind}
                      {l.notes && (
                        <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate max-w-[240px]">{l.notes}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-fg-muted">{l.orgaoNome ?? "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-fg-secondary">{l.number ?? "—"}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                      {l.expiresAt ? (
                        <>
                          {formatInstantDate(l.expiresAt)}
                          {prazo && <span className="block text-[length:var(--fs-micro)] text-fg-muted">{prazo}</span>}
                        </>
                      ) : (
                        <span className="text-fg-muted">não vence</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Selo tom={TOM_DA_VARIANTE[SITUACAO_VARIANTE[situacao]]}>{SITUACAO_LABEL[situacao]}</Selo>
                    </td>
                    <td className="py-2.5">
                      <AcoesDaLicenca orgaos={orgaos} licenca={paraEditar(l)} />
                    </td>
                  </LinhaFiltravel>
                );
              })}
            </tbody>
          </table>
        </TabelaNoDesktop>
      </TabelaFiltravel>
    </>
  );
}
