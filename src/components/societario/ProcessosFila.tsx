import Link from "next/link";
import { AlertCircle, ArrowRight, Clock, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate } from "@/lib/format";
import type { LinhaDaFila } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADE_LABEL, PRIORIDADE_VARIANTE } from "@/lib/societario/prioridade";
import { prazoCombinado } from "@/lib/societario/dados-do-processo";

export const SITUACAO_LABEL: Record<SituacaoDoProcesso, string> = {
  EM_EXIGENCIA: "Em exigência",
  AGUARDANDO_ORGAO: "Aguardando órgão",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  SUSPENSO: "Suspenso",
  CONCLUIDO: "Concluído",
};

// Cor por situação, e não uma cor só: quem abre esta tela precisa achar a
// exigência sem ler. Atenção é o que depende de gente; informação é o que
// depende do órgão.
export const SITUACAO_VARIANTE: Record<SituacaoDoProcesso, "danger" | "info" | "success" | "warning"> = {
  EM_EXIGENCIA: "warning",
  AGUARDANDO_ORGAO: "info",
  EM_ANDAMENTO: "success",
  AGUARDANDO_CLIENTE: "info",
  SUSPENSO: "danger",
  CONCLUIDO: "success",
};

/** A cor do prazo combinado com o cliente — a fila e o kanban usam a mesma. */
export const COR_DO_PRAZO_COMBINADO = {
  vencido: "text-danger font-medium",
  hoje: "text-danger font-medium",
  proximo: "text-warning-fg",
  folga: "text-fg-muted",
} as const;

/**
 * O prazo em uma frase.
 *
 * "sem previsão" não é falta de dado — é o alvará, que o próprio setor declara
 * como fluxo variável. Escrever "0 de 0 dias" ali seria inventar régua.
 */
export function PrazoCelula({ prazo }: { prazo: LinhaDaFila["prazo"] }) {
  if (prazo.situacao === "sem_previsao") {
    return (
      <span className="text-[length:var(--fs-2)] text-fg-muted">
        {prazo.dias} {prazo.dias === 1 ? "dia útil" : "dias úteis"} · sem previsão
      </span>
    );
  }
  const cor =
    prazo.situacao === "estourado"
      ? "text-danger"
      : prazo.situacao === "no_limite"
        ? "text-warning-fg"
        : "text-fg-secondary";
  const faixa =
    prazo.previstoMin !== null && prazo.previstoMin !== prazo.previstoMax
      ? `${prazo.previstoMin}–${prazo.previstoMax}`
      : String(prazo.previstoMax);
  return (
    <span className={`text-[length:var(--fs-2)] font-medium ${cor}`}>
      <span className="tabular-nums">{prazo.dias}</span> de{" "}
      <span className="tabular-nums">{faixa}</span> dias úteis
      {prazo.situacao === "estourado" && " · estourado"}
    </span>
  );
}

type Props = {
  linhas: LinhaDaFila[];
  /** Há processos no setor, mas nenhum passou pelo filtro atual. */
  filtrado: boolean;
  /** Agora, do servidor — o prazo combinado conta dias no fuso de São Paulo. */
  agora: Date;
};

/**
 * A fila de processos: tabela no computador, cartões no celular.
 *
 * Era uma lista de linhas-link sem colunas (até 30/09). Virou tabela no padrão
 * do Connect — centralizada, com funil por coluna — na onda 3 do polimento:
 * com 40 processos abertos, achar "os da Fulana em exigência" era ler a fila
 * inteira. A fila inteira do filtro já vem do servidor, então o funil filtra no
 * navegador (`TabelaFiltravel`).
 */
export function ProcessosFila({ linhas, filtrado, agora }: Props) {
  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nenhum processo neste filtro"
        description="Troque a busca ou o recorte, ou limpe os filtros acima, para ver os outros."
        icon={<Clock />}
      />
    ) : (
      <EmptyState
        title="Nenhum processo aberto"
        description="Constituição, alteração contratual, baixa e alvará aparecem aqui assim que forem abertos."
        icon={<Play />}
      />
    );
  }

  const combinadoDe = (l: LinhaDaFila) => (l.prazoCombinado ? prazoCombinado(l.prazoCombinado, agora) : null);

  // Os selos que acompanham o nome — prioridade fora do normal e as voltas.
  // Normal não ganha selo: selo em toda linha deixa de chamar atenção onde importa.
  const selos = (l: LinhaDaFila) => (
    <>
      {l.prioridade !== "NORMAL" && <Selo tom={tomDaVariante(PRIORIDADE_VARIANTE[l.prioridade])}>{PRIORIDADE_LABEL[l.prioridade]}</Selo>}
      {l.voltas > 0 && (
        <span className="inline-flex items-center gap-1 text-[length:var(--fs-micro)] text-danger whitespace-nowrap">
          <AlertCircle size={12} />
          {l.voltas} {l.voltas === 1 ? "volta" : "voltas"}
        </span>
      )}
    </>
  );

  const prazos = (l: LinhaDaFila) => {
    const combinado = combinadoDe(l);
    return (
      <>
        <PrazoCelula prazo={l.prazo} />
        {combinado && l.prazoCombinado && (
          <span className={`block text-[length:var(--fs-micro)] whitespace-nowrap ${COR_DO_PRAZO_COMBINADO[combinado.situacao]}`}>
            {combinado.texto} · {formatInstantDate(l.prazoCombinado)}
          </span>
        )}
      </>
    );
  };

  return (
    <>
      <CartoesNoCelular>
        {linhas.map((l) => (
          <Link key={l.id} href={`/processos/${l.id}`} className="block">
            <Cartao className="hover:border-brand/40 transition-colors">
              <TopoDoCartao nome={l.empresaNome} />
              <InfoDoCartao>
                {l.tipoNome}
                {l.titulo ? ` · ${l.titulo}` : ""}
              </InfoDoCartao>
              <InfoDoCartao>{l.etapasAgora.length > 0 ? l.etapasAgora.join(" · ") : "Nada liberado no roteiro"}</InfoDoCartao>
              <div className="mt-1.5">{prazos(l)}</div>
              {/* Situação e prioridade em Selo: é a situação de uma linha ou
                  cartão (regra de 02/10 no Selo; auditoria de 07/10/2026). */}
              <PeDoCartao>
                <Selo tom={tomDaVariante(SITUACAO_VARIANTE[l.situacao])}>{SITUACAO_LABEL[l.situacao]}</Selo>
                {selos(l)}
                <span className="ml-auto text-[length:var(--fs-micro)] text-fg-muted">{l.responsavelNome ?? "Sem responsável"}</span>
              </PeDoCartao>
            </Cartao>
          </Link>
        ))}
      </CartoesNoCelular>

      <TabelaFiltravel
        linhas={linhas.map((l) => ({
          id: l.id,
          valores: {
            empresa: l.empresaNome,
            tipo: l.tipoNome,
            prioridade: PRIORIDADE_LABEL[l.prioridade],
            situacao: SITUACAO_LABEL[l.situacao],
            responsavel: l.responsavelNome ?? "",
            inicio: saoPauloParts(l.iniciadoEm).dateKey,
          },
        }))}
      >
        <TabelaNoDesktop padrao>
          <table className="w-full table-fixed min-w-[1040px]">
            <colgroup>
              <col />
              <col className="w-[120px]" />
              <col className="w-[190px]" />
              <col className="w-[160px]" />
              <col className="w-[150px]" />
              <col className="w-[112px]" />
              <col className="w-[96px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-3">
                  <FiltroDaColuna
                    rotulo="Processo"
                    campos={[
                      { chave: "empresa", rotulo: "Empresa" },
                      { chave: "tipo", rotulo: "Tipo" },
                    ]}
                  />
                </th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Prioridade" chave="prioridade" />
                </th>
                <th className="px-4 py-3">Prazo</th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Situação" chave="situacao" />
                </th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Responsável" chave="responsavel" />
                </th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Início" chave="inicio" tipo="data" align="right" />
                </th>
                <th className="px-4 py-3">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border align-top">
                  <td className="px-4 py-3 min-w-0">
                    <Link
                      href={`/processos/${l.id}`}
                      className="block font-semibold text-fg hover:text-brand transition-colors truncate"
                      title={l.empresaNome}
                    >
                      {l.empresaNome}
                    </Link>
                    <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate" title={l.titulo ?? l.tipoNome}>
                      {l.tipoNome}
                      {l.titulo ? ` · ${l.titulo}` : ""}
                    </span>
                    <span
                      className="block text-[length:var(--fs-micro)] text-fg-muted truncate"
                      title={l.etapasAgora.join(" · ") || undefined}
                    >
                      {l.etapasAgora.length > 0 ? l.etapasAgora.join(" · ") : "Nada liberado no roteiro"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {l.prioridade === "NORMAL" && l.voltas === 0 ? (
                      <span className="text-fg-muted">Normal</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">{selos(l)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{prazos(l)}</td>
                  <td className="px-4 py-3">
                    <Selo tom={tomDaVariante(SITUACAO_VARIANTE[l.situacao])}>{SITUACAO_LABEL[l.situacao]}</Selo>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary truncate" title={l.responsavelNome ?? undefined}>
                    {l.responsavelNome ?? <span className="text-fg-muted">Sem responsável</span>}
                  </td>
                  <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatInstantDate(l.iniciadoEm)}</td>
                  <td className="px-4 py-3">
                    <Button href={`/processos/${l.id}`} variant="secondary" size="xs">
                      Abrir <ArrowRight size={12} />
                    </Button>
                  </td>
                </LinhaFiltravel>
              ))}
            </tbody>
          </table>
        </TabelaNoDesktop>
      </TabelaFiltravel>
    </>
  );
}
