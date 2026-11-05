"use client";

// O relatório da avaliação (o `StudyReport` do Connect Tributário): os mesmos
// valores do Resultado, os dados e a origem, as premissas, o responsável e a
// conclusão, e a memória técnica opcional. Imprimir usa o navegador
// (window.print), como no original; o estilo de impressão abaixo mostra só o
// papel do relatório, sem o menu do Connect. A identidade do relatório é a
// marca do escritório (logo e nome), no lugar do `ReportIdentity` do original.

import { Download, Printer } from "lucide-react";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { assess } from "@/lib/tributario/avaliacao/assessment";
import { fieldLabels, type Study } from "@/lib/tributario/avaliacao/model";
import { ENGINE, brl, percent } from "@/lib/tributario/motor/fiscal";
import { CABECALHO, CABECALHO_NUMERO, CELULA, CELULA_NUMERO, PAINEL, ROLAGEM_DA_TABELA, ROTULO, TABELA, TEXTO_DE_APOIO, TITULO_DA_SECAO } from "../estilos";
import { MemoriaDetalhada } from "../premissas/ControlesDoSimples";
import { MemoriaDaFolha } from "../premissas/ControlesDaFolha";
import { MemoriaDasAtividades } from "../premissas/AtividadesDaAvaliacao";

export type MarcaDoEscritorio = { nome: string; logoUrl: string | null };

type Props = {
  estudo: Study;
  ano: number;
  revisao: number | null;
  alteracoesNaoSalvas: boolean;
  marca: MarcaDoEscritorio;
  onBaixar: () => void;
  onChange: (p: Partial<Study>) => void;
  podeEditar: boolean;
};

const ID_DO_PAPEL = "relatorio-tributario";

// Na impressão, só o papel do relatório aparece (o resto da página fica
// invisível e o papel vai para o topo); os controles marcados com
// `data-sem-impressao` somem. Escopo por id: não afeta outras telas.
const ESTILO_DE_IMPRESSAO = `@media print {
  body * { visibility: hidden !important; }
  #${ID_DO_PAPEL}, #${ID_DO_PAPEL} * { visibility: visible !important; }
  #${ID_DO_PAPEL} { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; box-shadow: none; padding: 0; }
  #${ID_DO_PAPEL} [data-sem-impressao] { display: none !important; }
}`;

export function RelatorioDaAvaliacao({ estudo, ano, revisao, alteracoesNaoSalvas, marca, onBaixar, onChange, podeEditar }: Props) {
  const resultado = assess(estudo, [], ano);
  const completo = resultado.cards.every((c) => c.value !== null);

  return (
    <section className={PAINEL}>
      <style>{ESTILO_DE_IMPRESSAO}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={ROTULO}>Entrega da avaliação</p>
          <h2 className={TITULO_DA_SECAO}>Relatório</h2>
          <p className={TEXTO_DE_APOIO}>Os valores abaixo são os mesmos do Resultado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBaixar}>
            <Download size={16} /> Baixar relatório e memória
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={16} /> Imprimir / salvar PDF
          </Button>
        </div>
      </div>

      <article id={ID_DO_PAPEL} className="space-y-4 rounded-lg border border-border bg-surface p-6 text-ui text-fg">
        <header className="flex items-center gap-3 border-b border-border pb-4">
          {marca.logoUrl && <AvatarImage src={marca.logoUrl} name={marca.nome} size={48} shape="lg" />}
          <div>
            <p className="text-card-title font-semibold text-fg">{marca.nome}</p>
            <p className={ROTULO}>Planejamento tributário</p>
          </div>
        </header>
        <div className="space-y-1">
          <h1 className="text-display font-semibold text-fg">{estudo.name}</h1>
          <p>
            {estudo.cnpj || "CNPJ não informado"} · {estudo.start} a {estudo.end}
          </p>
          <p>
            Projeção {ano} · Motor {ENGINE} · {revisao ? `Revisão ${revisao}` : "Rascunho"}
            {alteracoesNaoSalvas ? " · alterações não salvas" : ""}
          </p>
          <p>{estudo.periodMode === "monthly-projection" ? "Média mensal projetada em 12 meses." : "Totais do período informado."}</p>
        </div>

        <div className={ROLAGEM_DA_TABELA}>
          <table className={TABELA}>
            <thead>
              <tr>
                <th className={CABECALHO}>Regime</th>
                <th className={CABECALHO_NUMERO}>Tributos e encargos</th>
                <th className={CABECALHO_NUMERO}>% da receita</th>
                <th className={CABECALHO}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {resultado.cards.map((c) => (
                <tr key={c.key}>
                  <td className={CELULA}>{c.name}</td>
                  <td className={CELULA_NUMERO}>{c.value === null ? "—" : brl(c.value)}</td>
                  <td className={CELULA_NUMERO}>{c.rate === null ? "—" : percent(c.rate)}</td>
                  <td className={CELULA}>
                    {c.status}
                    {c.pending.length > 0 && <p className="text-helper text-fg-muted">{c.pending.join(" ")}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className={TITULO_DA_SECAO}>Dados e origem</h2>
        <div className={ROLAGEM_DA_TABELA}>
          <table className={TABELA}>
            <thead>
              <tr>
                <th className={CABECALHO}>Informação</th>
                <th className={CABECALHO_NUMERO}>Valor informado</th>
                <th className={CABECALHO}>Origem</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(resultado.fields)
                .filter(([, v]) => v.value !== null)
                .map(([chave, v]) => (
                  <tr key={chave}>
                    <td className={CELULA}>{fieldLabels[chave]}</td>
                    <td className={CELULA_NUMERO}>
                      {chave.startsWith("prazo_") ? `${v.value} dias` : chave === "clientes_empresas" ? percent(v.value!) : brl(v.value!)}
                    </td>
                    <td className={CELULA}>
                      {v.source}
                      {v.issue && <p className="text-helper text-danger">{v.issue}</p>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <h2 className={TITULO_DA_SECAO}>Premissas e conclusão</h2>
        <p>
          CBS integral: {percent(estudo.base.cbs)}; IBS integral: {percent(estudo.base.ibs)}. Hipóteses configuráveis.{" "}
          {estudo.assumptionsReviewed ? "Premissas marcadas como revisadas." : "Premissas pendentes de revisão."}
        </p>
        {podeEditar && (
          <div className="space-y-3" data-sem-impressao>
            <CampoForm label="Responsável" htmlFor="relatorio-responsavel">
              <Input
                id="relatorio-responsavel"
                value={estudo.base.responsible}
                maxLength={160}
                onChange={(e) => onChange({ base: { ...estudo.base, responsible: e.target.value } })}
              />
            </CampoForm>
            <CampoForm label="Conclusão e observações" htmlFor="relatorio-conclusao">
              <Textarea id="relatorio-conclusao" value={estudo.notes} maxLength={5000} onChange={(e) => onChange({ notes: e.target.value })} />
            </CampoForm>
          </div>
        )}
        <p>Responsável: {estudo.base.responsible || "A informar"}</p>
        <p className="whitespace-pre-wrap">{estudo.notes || "Sem observações adicionais."}</p>

        {completo && (
          <BlocoRecolhivel titulo="Incluir memória técnica na impressão" classeDoConteudo="space-y-4 px-4 pb-4">
            <MemoriaDetalhada d={resultado.legacyData} year={ano} />
            <MemoriaDaFolha d={resultado.legacyData} year={ano} />
            {resultado.data.activities.enabled && <MemoriaDasAtividades d={resultado.legacyData} year={ano} />}
          </BlocoRecolhivel>
        )}

        <h2 className={TITULO_DA_SECAO}>Alcance da análise</h2>
        <p>
          Simulação parametrizada: elegibilidade e tratamentos específicos dependem dos dados e da conferência do responsável. O
          motor anual não realiza apuração trimestral, compensação automática de prejuízos nem projeção completa de caixa. Diferença
          de carga não é economia garantida.
        </p>
      </article>
    </section>
  );
}
