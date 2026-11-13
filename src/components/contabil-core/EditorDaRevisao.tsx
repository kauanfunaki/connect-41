"use client";

import { useId, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { dataBr, moedaDoRelatorio as moeda, plural } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import {
  TODAS_AS_CONTAS,
  alternar,
  contasDaOrigem,
  ehSaida,
  escolherExtrato,
  extratoEscolhido,
  extratoEscolhivel,
  extratoInicial,
  filtrarExtrato,
  filtrarRazao,
  indiceDoExtrato,
  indiceDoRazao,
  informado,
  naturezaDaComposicao,
  novoVinculo,
  paginaDe,
  podeRegistrar,
  razaoIndisponivel,
  totaisDaSelecao,
  usadosNaRevisao,
} from "@/lib/contabil-core/conciliacao/telaDaRevisao";
import type { NaturezaRazao, NovoVinculo, Revisao, TipoFonteRevisao } from "@/lib/contabil-core/conciliacao/revisaoTipos";

// Escolher uma composição manual (Bloco B, Fase B3, 12/11/2026): porte do `RevisaoManualEditor.tsx` do
// Contábil Core. A pessoa marca linhas do extrato e do Razão (da conta do banco ou de um Razão de apoio),
// a tela soma (decimal exato, sem `Number`) e mostra a diferença; com diferença, a observação é
// obrigatória. O servidor confere tudo de novo ao registrar.
//
// A chave do componente (no pai) inclui a versão da revisão: depois de registrar, ou de recarregar por
// conflito, a seleção volta limpa.

type Props = {
  revisao: Revisao;
  /** Linhas do extrato já marcadas ao abrir (a pendência de onde a revisão foi aberta). */
  extratoInicialIds: string[];
  ocupado: boolean;
  onRegistrar: (vinculo: NovoVinculo) => void;
};

const CARTAO = "flex gap-3 rounded-md border p-3 text-sm";

function Paginacao({ total, pagina, paginas, onPagina, rotulo }: { total: number; pagina: number; paginas: number; onPagina: (p: number) => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-fg-muted">
      <span>
        {plural(total, "lançamento", "lançamentos")} · Página {pagina + 1} de {paginas}
      </span>
      <div className="flex gap-1" role="group" aria-label={`Páginas: ${rotulo}`}>
        <Button type="button" size="xs" variant="secondary" disabled={pagina === 0} onClick={() => onPagina(pagina - 1)}>
          Anterior
        </Button>
        <Button type="button" size="xs" variant="secondary" disabled={pagina + 1 >= paginas} onClick={() => onPagina(pagina + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  );
}

export function EditorDaRevisao({ revisao, extratoInicialIds, ocupado, onRegistrar }: Props) {
  const base = useId();
  const usados = useMemo(() => usadosNaRevisao(revisao), [revisao]);
  const [selExtrato, setSelExtrato] = useState(() => extratoInicial(revisao, extratoInicialIds));
  const [selRazao, setSelRazao] = useState<Set<string>>(() => new Set());
  const [tipoFonte, setTipoFonte] = useState<TipoFonteRevisao>("RAZAO_BANCO");
  const [naturezaApoio, setNaturezaApoio] = useState<NaturezaRazao>("D");
  const [buscaExtrato, setBuscaExtrato] = useState("");
  const [buscaRazao, setBuscaRazao] = useState("");
  const [dataExtrato, setDataExtrato] = useState("");
  const [conta, setConta] = useState(TODAS_AS_CONTAS);
  const [observacao, setObservacao] = useState("");
  const [mostrarVinculados, setMostrarVinculados] = useState(false);
  const [paginaExtrato, setPaginaExtrato] = useState(0);
  const [paginaRazao, setPaginaRazao] = useState(0);

  // Os documentos podem ter milhares de linhas: o texto de busca é montado uma vez por revisão.
  const indiceExtrato = useMemo(() => indiceDoExtrato(revisao.extrato), [revisao.extrato]);
  const indiceRazao = useMemo(() => indiceDoRazao(revisao.linhasRazao), [revisao.linhasRazao]);
  const contas = useMemo(() => contasDaOrigem(revisao.linhasRazao, tipoFonte), [revisao.linhasRazao, tipoFonte]);
  const fontes = useMemo(() => new Map(revisao.fontes.map((f) => [f.id, f])), [revisao.fontes]);

  const linhasExtrato = extratoEscolhido(revisao.extrato, selExtrato);
  const natureza = naturezaDaComposicao(linhasExtrato, tipoFonte, naturezaApoio);
  const totais = totaisDaSelecao(revisao, selExtrato, selRazao, natureza);

  const extratoFiltrado = useMemo(
    () => filtrarExtrato(revisao.extrato, usados.extrato, indiceExtrato, { mostrarVinculados, data: dataExtrato, busca: buscaExtrato }),
    [revisao.extrato, usados.extrato, indiceExtrato, mostrarVinculados, dataExtrato, buscaExtrato],
  );
  const razaoFiltrado = useMemo(
    () => filtrarRazao(revisao.linhasRazao, usados.razao, indiceRazao, { tipoFonte, mostrarVinculados, conta, busca: buscaRazao }),
    [revisao.linhasRazao, usados.razao, indiceRazao, tipoFonte, mostrarVinculados, conta, buscaRazao],
  );
  const pagExtrato = paginaDe(extratoFiltrado, paginaExtrato);
  const pagRazao = paginaDe(razaoFiltrado, paginaRazao);

  const registravel = podeRegistrar({
    fontesValidas: revisao.fontesValidas,
    ocupado,
    qtdExtrato: selExtrato.size,
    qtdRazao: selRazao.size,
    totais,
    observacao,
  });
  const temApoio = revisao.fontes.some((f) => f.tipo === "RAZAO_APOIO");

  function trocarFonte(valor: TipoFonteRevisao) {
    setTipoFonte(valor);
    setConta(TODAS_AS_CONTAS);
    setSelRazao(new Set());
    setPaginaRazao(0);
  }

  function limpar() {
    setSelExtrato(new Set());
    setSelRazao(new Set());
    setObservacao("");
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${base}-titulo`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${base}-titulo`} className="text-sm font-semibold">
          Escolher a composição
        </h3>
        <Checkbox
          id={`${base}-vinculados`}
          checked={mostrarVinculados}
          onChange={(e) => {
            setMostrarVinculados(e.target.checked);
            setPaginaExtrato(0);
            setPaginaRazao(0);
          }}
          label="Mostrar lançamentos já vinculados"
        />
      </div>
      <p className="text-micro text-fg-muted" aria-live="polite">
        {usados.extrato.size + usados.razao.size === 0
          ? "Nenhum lançamento foi vinculado à mão nesta análise ainda."
          : `${plural(usados.extrato.size, "linha", "linhas")} do extrato e ${plural(usados.razao.size, "lançamento", "lançamentos")} do Razão já vinculados nesta análise. Mostrados, continuam bloqueados para não serem usados duas vezes.`}
      </p>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3" role="group" aria-label="Filtros da composição">
        <div className="grid gap-3 md:grid-cols-2">
          <RadioGroup<TipoFonteRevisao>
            variante="linha"
            legenda="Origem do Razão"
            valor={tipoFonte}
            onChange={trocarFonte}
            disabled={ocupado}
            opcoes={[
              { valor: "RAZAO_BANCO", rotulo: "Conta do banco" },
              { valor: "RAZAO_APOIO", rotulo: "Outras contas (Razão de apoio)" },
            ]}
          />
          <CampoForm label="Conta contábil do Razão" htmlFor={`${base}-conta`}>
            <SearchableSelect
              key={tipoFonte}
              id={`${base}-conta`}
              name="conta"
              options={contas}
              defaultValue={TODAS_AS_CONTAS}
              onChange={(v) => {
                setConta(v || TODAS_AS_CONTAS);
                setPaginaRazao(0);
              }}
            />
          </CampoForm>
        </div>
        {tipoFonte === "RAZAO_APOIO" ? (
          <div className="flex flex-col gap-1">
            <RadioGroup<NaturezaRazao>
              variante="linha"
              legenda="Coluna usada nesta composição"
              valor={naturezaApoio}
              disabled={ocupado}
              onChange={(v) => {
                setNaturezaApoio(v);
                setSelRazao(new Set());
              }}
              opcoes={[
                { valor: "D", rotulo: "Débitos" },
                { valor: "C", rotulo: "Créditos" },
              ]}
            />
            <p className="text-micro text-fg-muted">
              Escolha pela conferência: não misture provisão e baixa da mesma obrigação. Os valores das duas colunas continuam à vista.
            </p>
          </div>
        ) : (
          <p className="text-micro text-fg-muted">
            {linhasExtrato.length === 0
              ? "Escolha o extrato para definir a coluna do Razão: entrada usa o débito, saída usa o crédito."
              : `Nesta composição entram os ${natureza === "D" ? "débitos (entradas)" : "créditos (saídas)"} da conta do banco.`}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <CampoForm label="Data do extrato" htmlFor={`${base}-data`} className="max-w-44">
            <CampoData
              id={`${base}-data`}
              compact
              value={dataExtrato}
              onChange={(v) => {
                setDataExtrato(v);
                setPaginaExtrato(0);
              }}
            />
          </CampoForm>
          {dataExtrato && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setDataExtrato("")}>
              Todas as datas
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
          <h4 className="text-sm font-medium">Extrato bancário</h4>
          <Input
            type="search"
            compact
            aria-label="Buscar no extrato"
            placeholder="Histórico, favorecido, documento ou valor"
            value={buscaExtrato}
            onChange={(e) => {
              setBuscaExtrato(e.target.value);
              setPaginaExtrato(0);
            }}
          />
          <ul className="flex max-h-[440px] min-h-0 flex-col gap-2 overflow-y-auto pr-1" aria-label="Lançamentos do extrato">
            {pagExtrato.itens.map((l) => {
              const usado = usados.extrato.has(l.transacaoId);
              const escolhido = selExtrato.has(l.transacaoId);
              const bloqueado = usado || ocupado || !revisao.fontesValidas || !extratoEscolhivel(l);
              const id = `${base}-e-${l.transacaoId}`;
              return (
                <li key={l.transacaoId}>
                  <label
                    htmlFor={id}
                    className={`${CARTAO} ${escolhido ? "border-brand bg-brand/8" : "border-border"} ${bloqueado ? "opacity-60" : "cursor-pointer hover:bg-surface-hover"}`}
                  >
                    <span className="flex h-5 shrink-0 items-center">
                      <Checkbox
                        id={id}
                        checked={escolhido}
                        disabled={bloqueado}
                        onChange={() => {
                          const r = escolherExtrato(revisao, selExtrato, l.transacaoId, tipoFonte, natureza);
                          setSelExtrato(r.extrato);
                          if (r.limparRazao) setSelRazao(new Set());
                        }}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap justify-between gap-2">
                        <span className="tabular-nums">{dataBr(l.data)}</span>
                        <span className={`tabular-nums whitespace-nowrap font-semibold ${ehSaida(l.valor) ? "text-danger" : "text-success-fg"}`}>{moeda(l.valor)}</span>
                      </span>
                      <span className="break-words font-medium">{informado(l.historico)}</span>
                      <span className="text-micro text-fg-muted break-words">Favorecido: {informado(l.favorecido)}</span>
                      <span className="text-micro text-fg-muted break-words">Documento: {informado(l.documento)}</span>
                      {usado && (
                        <span>
                          <Selo tom="neutro">Já vinculado</Selo>
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
            {extratoFiltrado.length === 0 && <li className="py-5 text-center text-sm text-fg-muted">Nenhum lançamento com estes filtros.</li>}
          </ul>
          <Paginacao total={extratoFiltrado.length} pagina={pagExtrato.pagina} paginas={pagExtrato.paginas} onPagina={setPaginaExtrato} rotulo="extrato" />
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
          <h4 className="text-sm font-medium">Razão contábil</h4>
          <Input
            type="search"
            compact
            aria-label="Buscar no Razão"
            placeholder="Histórico, conta, lote, documento, favorecido ou valor"
            value={buscaRazao}
            onChange={(e) => {
              setBuscaRazao(e.target.value);
              setPaginaRazao(0);
            }}
          />
          <ul className="flex max-h-[440px] min-h-0 flex-col gap-2 overflow-y-auto pr-1" aria-label="Lançamentos do Razão">
            {pagRazao.itens.map((l) => {
              const usado = usados.razao.has(l.id);
              const escolhido = selRazao.has(l.id);
              const motivo = razaoIndisponivel(l, natureza, tipoFonte, linhasExtrato.length > 0);
              const bloqueado = usado || motivo !== null || ocupado || !revisao.fontesValidas;
              const id = `${base}-r-${l.id}`;
              return (
                <li key={l.id}>
                  <label
                    htmlFor={id}
                    className={`${CARTAO} ${escolhido ? "border-brand bg-brand/8" : "border-border"} ${usado || motivo ? "opacity-60" : "cursor-pointer hover:bg-surface-hover"}`}
                  >
                    <span className="flex h-5 shrink-0 items-center">
                      <Checkbox
                        id={id}
                        checked={escolhido}
                        disabled={bloqueado}
                        onChange={() => setSelRazao((antes) => alternar(antes, l.id))}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="tabular-nums">
                        {dataBr(l.data)} · {informado(l.contaCodigo)} · {informado(l.contaClassificacao)}
                      </span>
                      <span className="break-words font-medium">{informado(l.contaDescricao)}</span>
                      <span className="break-words">{informado(l.historico)}</span>
                      <span className="text-micro text-fg-muted break-words">
                        Favorecido: {informado(l.favorecido)} · Documento: {informado(l.documento)}
                      </span>
                      <span className="text-micro text-fg-muted break-words">
                        Lote: {informado(l.lote)} · Contrapartida: {informado(l.contrapartida)}
                      </span>
                      <span className="text-micro text-fg-muted break-words">Arquivo: {fontes.get(l.fonteId)?.nomeArquivo ?? "Não informado"}</span>
                      <span className="flex flex-wrap gap-3 text-micro tabular-nums">
                        <span className={natureza === "D" ? "font-semibold" : "text-fg-muted"}>D: {moeda(l.valorDebito)}</span>
                        <span className={natureza === "C" ? "font-semibold" : "text-fg-muted"}>C: {moeda(l.valorCredito)}</span>
                      </span>
                      {usado ? (
                        <span>
                          <Selo tom="neutro">Já vinculado</Selo>
                        </span>
                      ) : (
                        motivo && <span className="text-micro text-warning-fg">{motivo}</span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
            {razaoFiltrado.length === 0 && (
              <li className="py-5 text-center text-sm text-fg-muted">
                {tipoFonte === "RAZAO_APOIO" && !temApoio
                  ? "Ponha o Razão de apoio em “Arquivos da análise” para consultar FGTS, impostos ou outras contas."
                  : "Nenhum lançamento com estes filtros."}
              </li>
            )}
          </ul>
          <Paginacao total={razaoFiltrado.length} pagina={pagRazao.pagina} paginas={pagRazao.paginas} onPagina={setPaginaRazao} rotulo="Razão" />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3" aria-live="polite">
          <div>
            <dt className="text-micro text-fg-muted">Extrato ({selExtrato.size})</dt>
            <dd className="tabular-nums font-semibold">{moeda(totais.totalExtrato)}</dd>
          </div>
          <div>
            <dt className="text-micro text-fg-muted">Razão ({selRazao.size})</dt>
            <dd className="tabular-nums font-semibold">{moeda(totais.totalRazao)}</dd>
          </div>
          <div>
            <dt className="text-micro text-fg-muted">Razão − extrato</dt>
            <dd className={`tabular-nums font-semibold ${totais.temDiferenca ? "text-warning-fg" : "text-success-fg"}`}>{moeda(totais.diferenca)}</dd>
          </div>
        </dl>
        {!totais.mesmoSentido && (
          <p role="alert" className="text-sm text-warning-fg">
            Escolha só entradas ou só saídas numa composição.
          </p>
        )}
        <CampoForm
          label={totais.temDiferenca ? "Justificativa da diferença" : "Observação da conferência (opcional)"}
          htmlFor={`${base}-observacao`}
          required={totais.temDiferenca}
        >
          <Textarea
            id={`${base}-observacao`}
            rows={2}
            maxLength={2000}
            value={observacao}
            disabled={ocupado}
            placeholder="O critério da conferência ou a explicação da diferença."
            onChange={(e) => setObservacao(e.target.value)}
          />
        </CampoForm>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={limpar}>
            Limpar seleção
          </Button>
          <Button
            type="button"
            disabled={!registravel}
            loading={ocupado}
            loadingLabel="Registrando…"
            onClick={() => onRegistrar(novoVinculo(revisao, selExtrato, selRazao, natureza, observacao))}
          >
            <CheckCircle2 size={14} aria-hidden /> Registrar conferência manual
          </Button>
        </div>
        <p className="text-micro text-fg-muted">
          Os totais comparam valores absolutos. A soma fechar ajuda a conferir, mas confirmar a relação é responsabilidade de quem registra.
        </p>
      </div>
    </section>
  );
}
