import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { BlocoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { DECISOES, type TipoDeDecisao } from "@/lib/fiscal/motor/decisoes";
import { doMotor, type TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefDoMotor, param } from "@/lib/fiscal/motor/url";
import { dataHora } from "@/lib/fiscal/motor/formato";
import { TabelaDeDecisoes, type LinhaDeDecisao } from "./TabelaDeDecisoes";

const ACAO: Record<string, string> = { criou: "Criou", mudou: "Mudou", apagou: "Apagou" };

/**
 * As decisões de um ou mais tipos (`GET /decisoes/{tipo}`), com o recorte da
 * tela (competência e, nos tipos por estabelecimento, o CNPJ) e as últimas
 * linhas do registro de decisões da mesma tabela — quem decidiu, quando e de
 * onde (Connect, painel ou ferramenta).
 */
export async function DecisoesMotor({ tela, caminho, aba, tipos, params, permissoes }: {
  tela: TelaDoMotor;
  caminho: string;
  aba: string;
  tipos: TipoDeDecisao[];
  params: Record<string, string | string[] | undefined>;
  /** Por tipo: pode gravar (escrita + agir no módulo) e pode apagar (+ perfil que exclui). */
  permissoes: Partial<Record<TipoDeDecisao, { agir: boolean; excluir: boolean }>>;
}) {
  const { contexto, motor, mapa } = tela;
  if (!contexto) return null;
  const vistos = new Set(mapa.visiveis.map((e) => e.cnpj));
  const estabelecimentos = mapa.visiveis.map((e) => ({ cnpj: e.cnpj, rotulo: `${e.companyNome} · ${e.uf}` }));
  const secoes = await Promise.all(tipos.map(async (tipo) => {
    const def = DECISOES[tipo];
    const cursor = param(params, `c_${tipo}`) ?? null;
    const [lista, registro] = await Promise.all([
      doMotor(() => motor.cliente.listarDecisoes(contexto.raiz, tipo, {
        competencia: def.filtros.includes("competencia") ? contexto.competencia : undefined,
        cnpj: def.filtros.includes("cnpj") ? tela.estabelecimento?.cnpj : undefined,
        limite: 100,
        cursor,
      })),
      doMotor(() => motor.cliente.registroDeDecisoes(contexto.raiz, { tabela: def.tabela, competencia: def.filtros.includes("competencia") ? contexto.competencia : undefined, limite: 10 })),
    ]);
    // Decisão de estabelecimento que a pessoa não vê não aparece.
    const campoEstab = [...def.chave, ...def.valor].find((c) => c.estabelecimento)?.nome;
    const linhas = (lista.dados?.itens ?? []).filter((d) => {
      if (!campoEstab) return true;
      const cnpj = d.chave[campoEstab] ?? d.valor[campoEstab];
      return typeof cnpj !== "string" || vistos.has(cnpj);
    });
    return { tipo, def, cursor, lista, registro, linhas };
  }));
  return <div className="space-y-5">
    {secoes.map(({ tipo, def, cursor, lista, registro, linhas }) => {
      const p = permissoes[tipo] ?? { agir: false, excluir: false };
      const href = (extra: Record<string, string | undefined>) => hrefDoMotor(caminho, contexto, { aba, ...extra });
      return <BlocoFiscal key={tipo} titulo={def.rotulo} descricao={`${def.filtros.includes("competencia") ? `Competência ${contexto.competencia}` : "Vale para todas as competências"}${def.filtros.includes("cnpj") && tela.estabelecimento ? ` · ${tela.estabelecimento.companyNome}` : ""}.${!motor.escrita ? " Somente consulta: escrita do SPED não habilitada." : !p.agir ? " Somente consulta para o seu perfil." : ""}`}>
        <div className="space-y-4">
          {lista.erro ? <Aviso tom="atencao">{lista.erro}</Aviso>
            : <TabelaDeDecisoes tipo={tipo} raiz={contexto.raiz} linhas={linhas as LinhaDeDecisao[]} permiteAgir={motor.escrita && p.agir} permiteExcluir={p.excluir} estabelecimentos={estabelecimentos} competencia={contexto.competencia} />}
          <div className="flex flex-wrap gap-3">
            {cursor && <Button size="sm" variant="secondary" href={href({})}>Voltar ao início</Button>}
            {lista.dados?.proximo_cursor && <Button size="sm" variant="secondary" href={href({ [`c_${tipo}`]: lista.dados.proximo_cursor })}>Próxima página</Button>}
          </div>
          {registro.dados && registro.dados.itens.length > 0 && <BlocoRecolhivel titulo="Últimas alterações registradas" abertoInicial={false}>
            <div>
              <TabelaFiscal colunas={["Quando", "Quem", "Origem", "Ação", "Chave"]} linhas={registro.dados.itens.map((r) => ({ id: String(r.id), celulas: [
                dataHora(r.em), r.ator_nome ?? r.ator, r.origem, ACAO[r.acao] ?? r.acao, <span key="c" className="block max-w-64 break-all text-helper">{r.chave}</span>,
              ] }))} />
            </div>
          </BlocoRecolhivel>}
        </div>
      </BlocoFiscal>;
    })}
  </div>;
}
