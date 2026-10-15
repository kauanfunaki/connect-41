"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { FORA_DO_RESULTADO, GRUPOS, rotuloDoGrupo } from "@/lib/dre/estrutura";
import { totalForaDasLinhas, type Desconsiderada, type ItemDaFila } from "@/lib/dre/fila";
import {
  classificarCategoria,
  classificarCategoriaDoArquivo,
  voltarAoPadrao,
  type AcaoDoDre,
} from "@/app/(app)/dre/actions";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";

type Props = {
  companyId: string;
  itens: ItemDaFila[];
  /**
   * Para onde levar o "sem categoria" do financeiro, por lado. Nulo quando
   * quem vê não abre Contas a pagar ou a receber — link para uma tela que
   * responde 404 é pior que nenhum.
   */
  contas: { pagamento: string | null; recebimento: string | null };
  /** Categorias que esta empresa desviou do padrão, para poder desfazer. */
  excecoes: { categoryId: string; nome: string; grupo: string }[];
  desconsideradas: Desconsiderada[];
};

type EstadoDaLinha = { tipo: "salvando"; grupo: string } | { tipo: "salvo"; grupo: string } | { tipo: "erro"; mensagem: string };

/** Quanto a linha classificada fica à vista, com o "Salvo", antes de sair da lista. */
const SAIDA_MS = 1600;

/**
 * O conteúdo do painel de classificação da DRE (13/10/2026 — ver
 * `PainelDeClassificacao`): uma linha por categoria, densa, e escolher o grupo
 * já grava. Era um cartão por categoria com um "Salvar" ao lado, no meio do
 * relatório, e a fila de uma empresa grande enchia a tela.
 *
 * A linha classificada mostra "Salvo" por um instante e sai. A lista que vem
 * do servidor já chega sem ela (a ação revalida `/dre`); quem a segura na tela
 * pelo tempo do "Salvo" é `saindo`.
 */
export function FilaDeClassificacao({ companyId, itens, contas, excecoes, desconsideradas }: Props) {
  const [estado, setEstado] = useState<Record<string, EstadoDaLinha>>({});
  const [saindo, setSaindo] = useState<Record<string, ItemDaFila>>({});

  function mudar(chave: string, novo: EstadoDaLinha | null) {
    setEstado((s) => {
      const proximo = { ...s };
      if (novo) proximo[chave] = novo;
      else delete proximo[chave];
      return proximo;
    });
  }

  async function classificar(item: ItemDaFila, grupo: string) {
    const chave = item.categoria;
    if (!grupo || item.acao.tipo === "sem-categoria") return;
    mudar(chave, { tipo: "salvando", grupo });
    let r: AcaoDoDre;
    try {
      r =
        item.acao.tipo === "classificar"
          ? await classificarCategoria(companyId, item.acao.categoryId, grupo)
          : await classificarCategoriaDoArquivo(companyId, item.categoria, item.origem, grupo);
    } catch {
      r = { error: "Não consegui gravar. Tente de novo." };
    }
    if (r && "error" in r) {
      mudar(chave, { tipo: "erro", mensagem: r.error });
      return;
    }
    setSaindo((s) => ({ ...s, [chave]: item }));
    mudar(chave, { tipo: "salvo", grupo });
    setTimeout(() => {
      setSaindo((s) => {
        const proximo = { ...s };
        delete proximo[chave];
        return proximo;
      });
      mudar(chave, null);
    }, SAIDA_MS);
  }

  const naLista = new Set(itens.map((i) => i.categoria));
  const linhas = [...itens, ...Object.values(saindo).filter((i) => !naLista.has(i.categoria))].sort(
    (a, b) => Math.abs(b.centavos) - Math.abs(a.centavos)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-ui text-fg">
          {itens.length === 0 ? (
            <span className="font-semibold">Nada sem grupo neste período.</span>
          ) : (
            <>
              <span className="font-semibold">
                {itens.length === 1 ? "1 categoria" : `${itens.length} categorias`} sem grupo no DRE
              </span>{" "}
              <span className="text-fg-muted tabular-nums">· {moeda(totalForaDasLinhas(itens))}</span>
            </>
          )}
        </p>
        {/* O ponto da tela inteira: na planilha esse dinheiro não aparece em
            linha nenhuma, porque o SUMIF não encontra o que não está na lista. */}
        {itens.length > 0 && (
          <p className="text-fs-2 text-fg-muted">
            Esse valor fica fora do relatório até ter grupo. Escolher o grupo já grava, e o relatório atrás acompanha.
          </p>
        )}
      </div>

      {linhas.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {linhas.map((i) => (
            <LinhaDaFila
              key={i.categoria}
              item={i}
              estado={estado[i.categoria] ?? null}
              contas={contas}
              onEscolher={(grupo) => classificar(i, grupo)}
            />
          ))}
        </ul>
      )}

      <ForaDoPadrao companyId={companyId} excecoes={excecoes} desconsideradas={desconsideradas} />
    </div>
  );
}

/**
 * Uma categoria por linha: o nome e, embaixo, o lado, o valor e o andamento
 * ("Salvando…", "Salvo"); o seletor na mesma linha, à direita. No celular o
 * seletor desce para baixo do nome, na largura toda.
 */
function LinhaDaFila({
  item,
  estado,
  contas,
  onEscolher,
}: {
  item: ItemDaFila;
  estado: EstadoDaLinha | null;
  contas: Props["contas"];
  onEscolher: (grupo: string) => void;
}) {
  // O grupo escolhido fica no seletor enquanto grava e no "Salvo"; no erro,
  // volta ao "Classificar em…" para a pessoa escolher de novo.
  const escolhido = estado && estado.tipo !== "erro" ? estado.grupo : "";
  return (
    <li className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-fg truncate" title={item.categoria}>
          {item.categoria}
        </p>
        <p className="text-fs-2 text-fg-muted tabular-nums">
          {item.origem === "recebimento" ? "recebido" : "pago"} · <span className="text-fg-secondary">{moeda(item.centavos)}</span>
          <span role="status">
            {estado?.tipo === "salvando" && " · Salvando…"}
            {estado?.tipo === "salvo" && (
              <span className="font-medium text-success-fg">
                {" "}
                · <Check size={12} className="inline -mt-0.5" aria-hidden /> Salvo
              </span>
            )}
          </span>
        </p>
        {estado?.tipo === "erro" && <p className="text-micro text-danger mt-0.5">{estado.mensagem}</p>}
      </div>
      <div className="w-full sm:w-60 shrink-0">
        {item.acao.tipo === "sem-categoria" ? (
          <SemCategoria item={item} contas={contas} />
        ) : (
          <Select
            compact
            aria-label={`Grupo do DRE para ${item.categoria}`}
            value={escolhido}
            disabled={escolhido !== ""}
            onChange={(e) => onEscolher(e.target.value)}
            className="w-full"
          >
            <option value="">Classificar em…</option>
            {/* Só os grupos do lado do valor: um recebimento num grupo de despesa
                fica fora da conta (ver `grupoDoLancamento`) e voltaria para a fila. */}
            {GRUPOS.filter((g) => g.origem === item.origem).map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
            {/* Não é resultado, mas é uma escolha — e escolher isso é diferente
                de deixar sem classificar. */}
            <optgroup label="Fora do DRE">
              {FORA_DO_RESULTADO.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          </Select>
        )}
      </div>
    </li>
  );
}

/**
 * Sem categoria nenhuma não há o que classificar aqui — e a fila dizia
 * "classifique na ficha dele", uma ficha que não existe. Diz onde corrigir.
 */
function SemCategoria({ item, contas }: { item: ItemDaFila; contas: Props["contas"] }) {
  if (item.acao.tipo !== "sem-categoria") return null;
  const doArquivo = item.acao.fontes.includes("import");
  const doFinanceiro = item.acao.fontes.includes("financeiro");
  const href = item.origem === "pagamento" ? contas.pagamento : contas.recebimento;
  return (
    <p className="text-fs-2 text-fg-muted">
      {doArquivo && "Linhas do arquivo do Omie sem categoria: classifique no Omie e importe o mês de novo."}
      {doArquivo && doFinanceiro && " "}
      {doFinanceiro && (
        <>
          Contas sem categoria: a categoria vem de onde a conta nasceu — nas do Omie, classifique lá e a
          sincronização traz.{" "}
          {href && (
            <Button variant="link" href={href} className="text-fs-2">
              Ver as contas {item.origem === "pagamento" ? "a pagar" : "a receber"}
            </Button>
          )}
        </>
      )}
    </p>
  );
}

/**
 * As exceções da empresa e o que ficou desconsiderado, num bloco que começa
 * fechado (a regra do Kauan para recolhível, 08/10/2026) com o resumo na linha.
 */
function ForaDoPadrao({
  companyId,
  excecoes,
  desconsideradas,
}: {
  companyId: string;
  excecoes: Props["excecoes"];
  desconsideradas: Desconsiderada[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (excecoes.length === 0 && desconsideradas.length === 0) return null;

  async function desfazer(categoryId: string) {
    setOcupado(categoryId);
    setErro(null);
    let r: AcaoDoDre;
    try {
      r = await voltarAoPadrao(companyId, categoryId);
    } catch {
      r = { error: "Não consegui desfazer. Tente de novo." };
    }
    if (r && "error" in r) setErro(r.error);
    setOcupado(null);
  }

  const comValor = desconsideradas.filter((d) => d.centavos !== null);
  const totalDesconsiderado = totalForaDasLinhas(comValor.map((d) => ({ centavos: d.centavos! })));
  const resumo = [
    comValor.length > 0 &&
      `${moeda(totalDesconsiderado)} desconsiderados em ${comValor.length === 1 ? "1 categoria" : `${comValor.length} categorias`}`,
    excecoes.length > 0 && `${excecoes.length} fora do padrão`,
  ]
    .filter(Boolean)
    .join(" · ");

  const voltar = (categoryId: string, nome: string) => (
    // Revisão de 05/10: botão não é link — era texto azul.
    <Button
      variant="ghost"
      size="xs"
      disabled={ocupado === categoryId}
      onClick={() => desfazer(categoryId)}
      aria-label={`Voltar ${nome} ao padrão`}
    >
      <RotateCcw size={13} />
      Voltar ao padrão
    </Button>
  );

  return (
    <BlocoRecolhivel titulo="Fora do padrão e desconsideradas" resumo={resumo}>
      <div className="flex flex-col gap-4">
        {erro && <p className="text-micro text-danger">{erro}</p>}

        {desconsideradas.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="c41-rotulo">Desconsideradas no DRE</h3>
            <ul className="divide-y divide-border">
              {desconsideradas.map((d) => (
                <li key={`${d.nome}|${d.categoryId ?? ""}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
                  <span className="min-w-0 text-ui text-fg">
                    {d.nome}{" "}
                    <span className="text-fg-muted tabular-nums">
                      ·{" "}
                      {d.centavos === null
                        ? "sem movimento no período"
                        : `${d.origem === "recebimento" ? "recebido" : "pago"} ${moeda(d.centavos)}`}
                    </span>
                  </span>
                  {d.excecao && d.categoryId ? (
                    voltar(d.categoryId, d.nome)
                  ) : (
                    // A decisão está no plano de contas (do escritório ou da
                    // empresa), e é lá que se desfaz.
                    <span className="text-fs-2 text-fg-muted">pelo plano de contas</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {excecoes.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="c41-rotulo">Fora do padrão nesta empresa</h3>
            <ul className="divide-y divide-border">
              {excecoes.map((e) => (
                <li key={e.categoryId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
                  <span className="min-w-0 text-ui text-fg">
                    {e.nome} <span className="text-fg-muted">→ {rotuloDoGrupo(e.grupo)}</span>
                  </span>
                  {voltar(e.categoryId, e.nome)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </BlocoRecolhivel>
  );
}
