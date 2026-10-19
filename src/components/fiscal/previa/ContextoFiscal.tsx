"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FlaskConical, RotateCcw, ArrowLeft } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoMes } from "@/components/ui/CampoMes";
import { useConfirm } from "@/components/ui/useConfirm";
import { MenuFiscal as MenuDeMaisAcoes } from "./MenuFiscal";
import { ItemDoMenu } from "@/components/ui/Popover";
import { PageContainer } from "@/components/shared/PageContainer";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { COMPETENCIAS, chaveDoCenario, precisaRevisar, type AcaoFiscal, type ContextoFiscal } from "@/lib/fiscal/previa/cenario";
import { ultimasVersoesDoContexto } from "@/lib/fiscal/previa/fluxo";
import { agirNoFiscalLocal } from "@/app/(app)/fiscal/local-actions";
import type { EstadoFiscalLocal } from "@/lib/fiscal/local/servidor";

type Contexto = EstadoFiscalLocal & {
  pronto: boolean;
  resultado: { mensagem: string; erro?: boolean } | null;
  simular: (acao: AcaoFiscal) => void;
  visualizar: (titulo: string, conteudo: ReactNode) => void;
  pedirRestauracao: () => void;
  modulos: string[];
  integrado: boolean;
};
const FiscalContext = createContext<Contexto | null>(null);
export function useFiscal() {
  const contexto = useContext(FiscalContext);
  if (!contexto) throw new Error("O Fiscal precisa do seu contexto no banco local.");
  return contexto;
}
export const classeSelectFiscal = "w-full";

/** Dados no banco local; cabeçalho, filtros e avisos acompanham FiscalPagina. */
export function ContextoFiscalProvider({ children, tenantId, userId, inicial, modulos, integrado }: { children: ReactNode; tenantId: string; userId: string; inicial: EstadoFiscalLocal; modulos: string[]; integrado: boolean }) {
  const [estado, setEstado] = useState(inicial);
  const atual = useRef(inicial);
  const fila = useRef(Promise.resolve());
  const [pendentes, setPendentes] = useState(0);
  const [resultado, setResultado] = useState<{ mensagem: string; erro?: boolean } | null>(null);
  const [previas, setPrevias] = useState<{ titulo: string; conteudo: ReactNode }[]>([]);
  const previa = previas.at(-1);
  const { dialog, requestConfirm } = useConfirm();

  useEffect(() => {
    // Remove os antigos dados deste usuário; a fonte passa a ser o banco.
    try {
      localStorage.removeItem(chaveDoCenario(tenantId, userId));
      localStorage.removeItem(`connect41:fiscal:empresas-favoritas:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`);
    } catch { /* O banco independe do armazenamento do navegador. */ }
  }, [tenantId, userId]);

  const enviar = (acao: AcaoFiscal | { tipo: "restaurar" }) => {
    setPendentes((n) => n + 1);
    fila.current = fila.current.then(async () => {
      try {
        const resposta = await agirNoFiscalLocal(acao, atual.current.revisao);
        if (resposta.estado) { atual.current = resposta.estado; setEstado(resposta.estado); }
        setResultado(acao.tipo !== "contexto" || resposta.erro
          ? { mensagem: resposta.mensagem, erro: resposta.erro }
          : null);
      } catch {
        setResultado({ mensagem: "Não foi possível confirmar a gravação no banco. Recarregue a página antes de repetir a ação.", erro: true });
      } finally { setPendentes((n) => n - 1); }
    });
  };
  const pedirRestauracao = () => requestConfirm({
    title: "Restaurar dados de teste?",
    description: "As alterações fictícias deste usuário e escritório serão substituídas pelo cenário inicial no banco local.",
    confirmLabel: "Restaurar cenário inicial",
    destructive: true,
  }, async () => { enviar({ tipo: "restaurar" }); });

  return (
    <FiscalContext.Provider value={{ ...estado, pronto: pendentes === 0, resultado, simular: enviar, visualizar: (titulo, conteudo) => setPrevias((atuais) => [...atuais, { titulo, conteudo }]), pedirRestauracao, modulos, integrado }}>
      <PageContainer>
        {children}
        <p className="mt-7 text-helper text-fg-muted">Dados fictícios no banco local · geração e validação simuladas, sem validade fiscal.</p>
      </PageContainer>
      <Modal open={!!previa} title={previa?.titulo} onClose={() => setPrevias([])} maxWidth="max-w-3xl">
        <p className="mb-4 mt-1 text-helper text-fg-secondary">Ambiente local · esta prévia usa informações fictícias do banco de testes.</p>
        {previa?.conteudo}
        {resultado && <div role={resultado.erro ? "alert" : "status"} className="mt-4"><Aviso tom={resultado.erro ? "atencao" : "sucesso"}>{resultado.mensagem}</Aviso></div>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {previas.length > 1 && <Button variant="secondary" onClick={() => setPrevias((atuais) => atuais.slice(0, -1))}><ArrowLeft size={14} />Voltar para {previas.at(-2)?.titulo}</Button>}
          <Button variant="secondary" onClick={() => setPrevias([])}>Fechar prévia</Button>
        </div>
      </Modal>
      {dialog}
    </FiscalContext.Provider>
  );
}

/** A linha de selos do cabeçalho: o modo de teste e onde o cenário fica guardado. */
export function SelosDoTesteFiscal() {
  const { pronto } = useFiscal();
  return <>
    <Badge variant="info"><FlaskConical size={13} className="mr-1.5" />Ambiente local · dados fictícios</Badge>
    <span>{pronto ? "Salvo no banco local" : "Salvando no banco local…"}</span>
  </>;
}

/** O "⋯" do cabeçalho. Restaurar desfaz o que se fez no teste: fica no menu mesmo sozinho. */
export function MenuDoCenarioFiscal() {
  const { pronto, pedirRestauracao } = useFiscal();
  return <MenuDeMaisAcoes rotulo="Opções do cenário de teste" width={240} size="md" sempreMenu>
    {({ close }) => <ItemDoMenu disabled={!pronto} icone={<RotateCcw />} onClick={() => { close(); pedirRestauracao(); }}>Restaurar dados de teste</ItemDoMenu>}
  </MenuDeMaisAcoes>;
}

/**
 * Empresa, estabelecimento e competência logo abaixo do cabeçalho, como o
 * `FiltroDaEmpresa` das outras telas (15/10/2026). A empresa se escolhe no
 * seletor de sempre — busca por nome ou CNPJ e as recentes no topo, guardadas
 * à parte das empresas reais — e a competência no campo de mês. Eram um
 * botão desenhado como campo, com estrela de favoritas, e uma lista comum,
 * dentro de um bloco recolhível acima do título.
 */
export function FiltroDoContextoFiscal() {
  const { cenario, pronto, simular } = useFiscal();
  const { contexto } = cenario;
  const empresa = cenario.empresas.find((e) => e.id === contexto.empresaId)!;
  const trocar = (mudanca: Partial<ContextoFiscal>) => simular({ tipo: "contexto", contexto: { ...contexto, ...mudanca } });
  return <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <span className="c41-rotulo flex-shrink-0">Empresa</span>
      <SearchableSelect
        key={empresa.id}
        name="empresa"
        compact
        className="w-80 max-w-full min-w-0"
        aria-label="Empresa"
        options={opcoesDeEmpresa(cenario.empresas.map((e) => ({ id: e.id, nome: e.nome, cnpj: e.estabelecimentos[0]?.cnpj.replace(/\D/g, "") })))}
        avatar
        lembrarRecentes="fiscal-previa-empresas"
        defaultValue={empresa.id}
        placeholder="Buscar empresa por nome ou CNPJ…"
        onChange={(id) => { if (id && id !== empresa.id) trocar({ empresaId: id, estabelecimentoId: "" }); }}
      />
    </div>
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <label htmlFor="fiscal-estabelecimento" className="c41-rotulo flex-shrink-0">Estabelecimento</label>
      <Select id="fiscal-estabelecimento" compact className="w-60 max-w-full" disabled={!pronto} value={contexto.estabelecimentoId} onChange={(e) => trocar({ estabelecimentoId: e.target.value })}>
        <option value="">Todos os estabelecimentos</option>
        {empresa.estabelecimentos.map((e) => <option key={e.id} value={e.id}>{e.nome} · {e.uf}</option>)}
      </Select>
    </div>
    <div className="flex items-center gap-2">
      <label htmlFor="fiscal-competencia" className="c41-rotulo flex-shrink-0">Competência</label>
      <CampoMes id="fiscal-competencia" compact className="w-40" aria-label="Competência" disabled={!pronto} value={contexto.competencia} min={COMPETENCIAS[0]} max={COMPETENCIAS.at(-1)} onChange={(v) => { if (COMPETENCIAS.includes(v) && v !== contexto.competencia) trocar({ competencia: v }); }} />
    </div>
  </div>;
}

/**
 * O resultado da última ação e as versões que pedem revisão, no `Aviso` do
 * Connect (15/10/2026): eram caixas coloridas montadas à mão.
 */
export function AvisosFiscais() {
  const { resultado, pronto, cenario, modulos } = useFiscal();
  const revisoes = pronto ? ultimasVersoesDoContexto(cenario).filter((a) => precisaRevisar(cenario, a)).length : 0;
  if (!resultado && revisoes === 0) return null;
  return <div className="mb-5 flex flex-col gap-3">
    {resultado && <div role={resultado.erro ? "alert" : "status"}><Aviso tom={resultado.erro ? "atencao" : "info"}>{resultado.mensagem}</Aviso></div>}
    {revisoes > 0 && <Aviso tom="atencao"><span className="flex flex-wrap items-center justify-between gap-3"><span>{revisoes} versão(ões) de teste precisam de revisão: os dados mudaram após a geração.</span>{modulos.includes("fiscal_entregas") && <Button href="/fiscal/entregas" variant="secondary" size="sm">Revisar e gerar nova versão</Button>}</span></Aviso>}
  </div>;
}
