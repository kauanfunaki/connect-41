"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoData } from "@/components/ui/CampoData";
import { CampoMes } from "@/components/ui/CampoMes";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import {
  alterarContasEmLote,
  dadosDaAlteracaoEmLote,
  type DadosDaAlteracao,
  type ResultadoDaAlteracao,
} from "@/lib/financeiro/edicaoEmLoteServidor";
import { motivosAgrupados, separarAlteracao, type CampoDoLote } from "@/lib/financeiro/edicaoEmLote";
import type { ForaDoLote } from "@/lib/financeiro/baixa/lote";

type Opcao = { id: string; nome: string };
type EmpresaComCentros = Opcao & { centros: Opcao[] };
type Carregado = Extract<DadosDaAlteracao, { ok: true }>;
type Gravado = Extract<ResultadoDaAlteracao, { ok: true }>;

const contas = (n: number) => (n === 1 ? "1 conta" : `${n} contas`);

function resumo(r: Gravado) {
  const feitas = `${contas(r.alteradas)} ${r.alteradas === 1 ? "alterada" : "alteradas"}`;
  if (r.jaEstavam === 0) return `${feitas}.`;
  return `${feitas} — ${contas(r.jaEstavam)} já ${r.jaEstavam === 1 ? "estava" : "estavam"} assim.`;
}

/**
 * "Alterar marcadas" (lote D da fila do BPO, 20/10 — o "Alterar em lote" do
 * Omie): vencimento, previsão, competência, categoria, centro de custo, projeto
 * e conta corrente prevista das contas marcadas, de uma vez. Só muda o que a pessoa marca; o resto fica
 * como está em cada conta.
 *
 * Abre com "Carregando…" e pergunta ao servidor as travas de cada conta e as
 * listas: a tabela não sabe o que está conciliado nem de onde a conta veio, e
 * categoria e projeto dependem da empresa — a lista mistura empresas. Os
 * centros vêm da tela, que já os tem por empresa.
 */
export function JanelaDaAlteracaoEmLote({
  ids,
  centros,
  onFechar,
  onAlteradas,
}: {
  ids: string[];
  /** Os centros ativos de cada empresa da lista. `null` quando a lista não usa centro: o campo não aparece. */
  centros: EmpresaComCentros[] | null;
  onFechar: () => void;
  onAlteradas: (resumo: string) => void;
}) {
  const [dados, setDados] = useState<DadosDaAlteracao | null>(null);
  const [resultado, setResultado] = useState<Gravado | null>(null);
  const [pendente, setPendente] = useState(false);

  useEffect(() => {
    let vivo = true;
    dadosDaAlteracaoEmLote(ids).then((d) => vivo && setDados(d));
    return () => {
      vivo = false;
    };
  }, [ids]);

  return (
    <Modal open onClose={() => !pendente && onFechar()} title="Alterar contas marcadas" maxWidth="max-w-2xl">
      {resultado ? (
        <Resultado resultado={resultado} onFechar={onFechar} />
      ) : dados === null ? (
        <p className="py-6 text-center text-fs-2 text-fg-muted">Carregando…</p>
      ) : !dados.ok ? (
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao" icone={<Lock />}>
            {dados.erro}
          </Aviso>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <Formulario
          dados={dados}
          centros={centros}
          aoMudarPendente={setPendente}
          onCancelar={onFechar}
          onGravado={(r) => {
            if (r.ficaram.length === 0) onAlteradas(resumo(r));
            else setResultado(r);
          }}
        />
      )}
    </Modal>
  );
}

/** Quem fica de fora, agrupado pelo motivo: a seleção vai a 200 contas. */
/** Quem fica de fora do lote, agrupado por motivo e com altura máxima — a janela da baixa em lote usa a mesma. */
export function ListaDeFora({ ficam, titulo }: { ficam: ForaDoLote[]; titulo: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label font-semibold text-fg">{titulo}</p>
      <ul className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto text-fs-2 text-fg-secondary">
        {motivosAgrupados(ficam).map((g) => {
          const nomes = [...new Set(g.nomes)];
          return (
            <li key={g.motivo}>
              <span className="font-medium text-fg">{contas(g.nomes.length)}</span> — {g.motivo}
              <span className="block text-micro text-fg-muted">
                {nomes.slice(0, 3).join(", ")}
                {nomes.length > 3 && ` e mais ${nomes.length - 3}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Uma linha da janela: a caixa diz se o campo muda; desmarcada, o campo fica desligado e não vai. */
function Linha({
  id,
  rotulo,
  marcada,
  onAlternar,
  desabilitada = false,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  marcada: boolean;
  onAlternar: () => void;
  desabilitada?: boolean;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[168px_1fr] sm:items-start">
      <div className="sm:pt-2">
        <Checkbox id={id} label={rotulo} checked={marcada} onChange={onAlternar} disabled={desabilitada} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {children}
        {ajuda && <p className="text-helper text-fg-muted">{ajuda}</p>}
      </div>
    </div>
  );
}

function Formulario({
  dados,
  centros,
  aoMudarPendente,
  onCancelar,
  onGravado,
}: {
  dados: Carregado;
  centros: EmpresaComCentros[] | null;
  aoMudarPendente: (p: boolean) => void;
  onCancelar: () => void;
  onGravado: (r: Gravado) => void;
}) {
  const id = useId();
  const aPagar = dados.kind === "PAGAR";
  const [campos, setCampos] = useState<CampoDoLote[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [centroId, setCentroId] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [contaId, setContaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const marcada = (c: CampoDoLote) => campos.includes(c);
  const alternar = (c: CampoDoLote) => setCampos((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]));

  const variasEmpresas = dados.empresas.length > 1;
  const daSelecao = new Set(dados.empresas.map((e) => e.id));
  const comCentros = (centros ?? []).filter((e) => daSelecao.has(e.id) && e.centros.length > 0);
  const comProjetos = dados.empresas.filter((e) => e.projetos.length > 0);
  const empresaDoCentro = centroId ? (comCentros.find((e) => e.centros.some((c) => c.id === centroId))?.id ?? null) : null;
  const empresaDoProjeto = projetoId ? (comProjetos.find((e) => e.projetos.some((p) => p.id === projetoId))?.id ?? null) : null;
  const comContas = dados.empresas.filter((e) => e.contas.length > 0);
  const empresaDaConta = contaId ? (comContas.find((e) => e.contas.some((c) => c.id === contaId))?.id ?? null) : null;

  const { entram, ficam } = separarAlteracao(dados.contas, {
    campos,
    categoriaId: categoriaId || null,
    centroDaEmpresa: empresaDoCentro,
    projetoDaEmpresa: empresaDoProjeto,
    contaDaEmpresa: empresaDaConta,
  });
  // Conta a pagar não fica sem categoria: até escolher, não há o que prever.
  const faltaCategoria = aPagar && marcada("categoria") && !categoriaId;

  /** As opções de centro ou projeto: agrupadas por empresa quando a seleção tem mais de uma. */
  const opcoesPorEmpresa = (grupos: (Opcao & { itens: Opcao[] })[]) =>
    grupos.length === 1
      ? grupos[0]!.itens.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))
      : grupos.map((g) => (
          <optgroup key={g.id} label={g.nome}>
            {g.itens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </optgroup>
        ));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setErro(null);
        aoMudarPendente(true);
        startTransition(async () => {
          const r = await alterarContasEmLote(form);
          aoMudarPendente(false);
          if ("error" in r) setErro(r.error);
          else onGravado(r);
        });
      }}
    >
      {entram.map((c) => (
        <input key={c.id} type="hidden" name="entryIds" value={c.id} />
      ))}
      {campos.map((c) => (
        <input key={c} type="hidden" name="campos" value={c} />
      ))}

      <p className="text-helper text-fg-secondary">
        {contas(dados.contas.length)} {aPagar ? "a pagar" : "a receber"}
        {variasEmpresas && ` de ${dados.empresas.length} empresas`}. Marque o que muda: o que não for marcado fica como está em cada conta.
      </p>

      <div className="flex flex-col divide-y divide-border-soft rounded-md border border-border">
        <Linha
          id={`${id}-m-vencimento`}
          rotulo="Vencimento"
          marcada={marcada("vencimento")}
          onAlternar={() => alternar("vencimento")}
          ajuda="Não muda em conta paga, conciliada, do Omie ou parcela de acordo."
        >
          <CampoData id={`${id}-vencimento`} aria-label="Novo vencimento" name="vencimento" disabled={!marcada("vencimento")} required={marcada("vencimento")} />
        </Linha>
        <Linha
          id={`${id}-m-previsao`}
          rotulo="Previsão"
          marcada={marcada("previsao")}
          onAlternar={() => alternar("previsao")}
          ajuda="Quando deve ser paga de fato. Em branco, tira a previsão e vale o vencimento. Não muda em conta paga."
        >
          <CampoData id={`${id}-previsao`} aria-label="Nova previsão" name="previsao" disabled={!marcada("previsao")} />
        </Linha>
        <Linha
          id={`${id}-m-competencia`}
          rotulo="Competência"
          marcada={marcada("competencia")}
          onAlternar={() => alternar("competencia")}
          ajuda="O mês que a DRE econômica soma."
        >
          <CampoMes id={`${id}-competencia`} aria-label="Nova competência" name="competencia" disabled={!marcada("competencia")} required={marcada("competencia")} />
        </Linha>
        <Linha
          id={`${id}-m-categoria`}
          rotulo="Categoria"
          marcada={marcada("categoria")}
          onAlternar={() => alternar("categoria")}
          ajuda={variasEmpresas ? "Só as categorias que valem no plano de todas as empresas marcadas." : undefined}
        >
          <Select
            id={`${id}-categoria`}
            name="categoryId"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            disabled={!marcada("categoria")}
            required={aPagar && marcada("categoria")}
            aria-label="Categoria"
          >
            <option value="">{aPagar ? "Escolha…" : "Sem categoria"}</option>
            {dados.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Linha>
        {centros && (
          <Linha
            id={`${id}-m-centro`}
            rotulo="Centro de custo"
            marcada={marcada("centro")}
            onAlternar={() => alternar("centro")}
            ajuda={variasEmpresas ? "Um centro é de uma empresa só: as contas das outras ficam de fora." : undefined}
          >
            <Select
              id={`${id}-centro`}
              name="costCenterId"
              value={centroId}
              onChange={(e) => setCentroId(e.target.value)}
              disabled={!marcada("centro")}
              aria-label="Centro de custo"
            >
              <option value="">Sem centro de custo</option>
              {opcoesPorEmpresa(comCentros.map((e) => ({ id: e.id, nome: e.nome, itens: e.centros })))}
            </Select>
          </Linha>
        )}
        <Linha
          id={`${id}-m-projeto`}
          rotulo="Projeto"
          marcada={marcada("projeto")}
          onAlternar={() => alternar("projeto")}
          ajuda={
            comProjetos.length === 0
              ? "Nenhum projeto nas empresas marcadas. Dá para tirar o projeto das contas, ou cadastrar em Fornecedores e sacados › Projetos."
              : variasEmpresas
                ? "Um projeto é de uma empresa só: as contas das outras ficam de fora."
                : undefined
          }
        >
          <Select
            id={`${id}-projeto`}
            name="projectId"
            value={projetoId}
            onChange={(e) => setProjetoId(e.target.value)}
            disabled={!marcada("projeto")}
            aria-label="Projeto"
          >
            <option value="">Sem projeto</option>
            {opcoesPorEmpresa(comProjetos.map((e) => ({ id: e.id, nome: e.nome, itens: e.projetos })))}
          </Select>
        </Linha>
        <Linha
          id={`${id}-m-conta`}
          rotulo="Conta corrente"
          marcada={marcada("conta")}
          onAlternar={() => alternar("conta")}
          ajuda={
            comContas.length === 0
              ? "Nenhuma conta bancária nas empresas marcadas. Dá para tirar a conta prevista, ou cadastrar em Banco e caixa."
              : variasEmpresas
                ? "A prevista, que a baixa já traz marcada. Uma conta é de uma empresa só: as contas das outras ficam de fora."
                : "A prevista, que a baixa já traz marcada."
          }
        >
          <Select
            id={`${id}-conta`}
            name="bankAccountId"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            disabled={!marcada("conta")}
            aria-label="Conta corrente"
          >
            <option value="">Não prevista</option>
            {opcoesPorEmpresa(comContas.map((e) => ({ id: e.id, nome: e.nome, itens: e.contas })))}
          </Select>
        </Linha>
      </div>

      {campos.length > 0 && !faltaCategoria && (
        <div className="flex flex-col gap-3">
          <p className="text-fs-2 text-fg">
            {entram.length === 0 ? (
              "Nenhuma das contas marcadas pode mudar assim."
            ) : (
              <>
                <strong>{contas(entram.length)}</strong> {entram.length === 1 ? "vai mudar" : "vão mudar"}.
              </>
            )}
          </p>
          {ficam.length > 0 && <ListaDeFora ficam={ficam} titulo={`Ficam de fora (${ficam.length})`} />}
        </div>
      )}

      <FormFooter
        pending={pendente}
        submitLabel={entram.length > 0 && campos.length > 0 ? `Alterar ${contas(entram.length)}` : "Alterar"}
        pendingLabel="Alterando…"
        submitDisabled={campos.length === 0 || entram.length === 0 || faltaCategoria}
        onCancel={onCancelar}
        erro={erro}
      />
    </form>
  );
}

function Resultado({ resultado, onFechar }: { resultado: Gravado; onFechar: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {resultado.alteradas > 0 || resultado.jaEstavam > 0 ? (
        <Aviso tom="sucesso">{resumo(resultado)}</Aviso>
      ) : (
        <Aviso tom="atencao">Nenhuma conta foi alterada.</Aviso>
      )}
      <ListaDeFora ficam={resultado.ficaram} titulo={`Não alteradas (${resultado.ficaram.length})`} />
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onFechar}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
