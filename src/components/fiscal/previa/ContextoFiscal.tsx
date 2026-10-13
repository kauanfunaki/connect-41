"use client";

import { Select } from "@/components/ui/Select";

import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from "react";
import { FlaskConical, RotateCcw, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Accordion } from "@/components/ui/Accordion";
import { MenuFiscal as MenuDeMaisAcoes } from "./MenuFiscal";
import { ItemDoMenu } from "@/components/ui/Popover";
import { PageContainer } from "@/components/shared/PageContainer";
import { COMPETENCIAS, chaveDoCenario, criarCenario, executarAcao, lerCenario, precisaRevisar, type AcaoFiscal, type Cenario, type ContextoFiscal } from "@/lib/fiscal/previa/cenario";
import { ultimasVersoesDoContexto } from "@/lib/fiscal/previa/fluxo";

type Estado = { cenario: Cenario; pronto: boolean; armazenamento: boolean; resultado: { mensagem: string; erro?: boolean } | null };
type Evento = { tipo: "carregar"; cenario: Cenario; armazenamento: boolean; recuperado: boolean } | { tipo: "acao"; acao: AcaoFiscal; contexto: ContextoFiscal; id: string; agora: string } | { tipo: "armazenamento" } | { tipo: "restaurar" };
function reduzir(estado: Estado, evento: Evento): Estado {
  if (evento.tipo === "carregar") return { cenario: evento.cenario, pronto: true, armazenamento: evento.armazenamento, resultado: evento.recuperado ? { mensagem: "Os dados locais estavam incompatíveis. O cenário inicial foi restaurado." } : null };
  if (evento.tipo === "armazenamento") return { ...estado, armazenamento: false };
  if (evento.tipo === "restaurar") return { ...estado, cenario: criarCenario(), resultado: { mensagem: "Dados de teste restaurados para este usuário e escritório." } };
  const resultado = executarAcao(estado.cenario, evento.acao, evento.contexto, evento.agora, evento.id);
  return { ...estado, cenario: resultado.cenario, resultado: { mensagem: resultado.mensagem, erro: resultado.erro } };
}

type Contexto = Estado & { simular: (acao: AcaoFiscal) => void; visualizar: (titulo: string, conteudo: ReactNode) => void; modulos: string[]; integrado: boolean };
const FiscalContext = createContext<Contexto | null>(null);
export function useFiscal() {
  const contexto = useContext(FiscalContext);
  if (!contexto) throw new Error("A prévia fiscal precisa do seu contexto local.");
  return contexto;
}
export const classeSelectFiscal = "w-full";

export function ContextoFiscalProvider({ children, tenantId, userId, modulos, integrado }: { children: ReactNode; tenantId: string; userId: string; modulos: string[]; integrado: boolean }) {
  const [estado, dispatch] = useReducer(reduzir, undefined, () => ({ cenario: criarCenario(), pronto: false, armazenamento: true, resultado: null }));
  const [previa, setPrevia] = useState<{ titulo: string; conteudo: ReactNode } | null>(null);
  const [restaurar, setRestaurar] = useState(false);
  const chave = chaveDoCenario(tenantId, userId);
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chave);
      const salvo = lerCenario(bruto);
      dispatch({ tipo: "carregar", cenario: salvo ?? criarCenario(), armazenamento: true, recuperado: bruto !== null && salvo === null });
    } catch { dispatch({ tipo: "carregar", cenario: criarCenario(), armazenamento: false, recuperado: false }); }
  }, [chave]);
  useEffect(() => {
    // Não gravar antes da leitura evita apagar o cenário salvo durante a hidratação.
    if (!estado.pronto || !estado.armazenamento) return;
    try { localStorage.setItem(chave, JSON.stringify(estado.cenario)); }
    catch { dispatch({ tipo: "armazenamento" }); }
  }, [chave, estado.cenario, estado.pronto, estado.armazenamento]);
  const simular = (acao: AcaoFiscal) => {
    if (estado.pronto) dispatch({ tipo: "acao", acao, contexto: estado.cenario.contexto, id: crypto.randomUUID(), agora: new Date().toISOString() });
  };
  const { cenario } = estado;
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
  const revisoes = ultimasVersoesDoContexto(cenario).filter((a) => precisaRevisar(cenario, a)).length;
  return (
    <FiscalContext.Provider value={{ ...estado, simular, visualizar: (titulo, conteudo) => setPrevia({ titulo, conteudo }), modulos, integrado }}>
      <PageContainer>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info"><FlaskConical size={13} className="mr-1.5" />Modo de teste · dados fictícios</Badge>
            <span className="text-helper text-fg-secondary">{estado.armazenamento ? "Salvo neste navegador" : "Somente nesta sessão · armazenamento indisponível"}</span>
          </div>
          <MenuDeMaisAcoes rotulo="Opções do cenário de teste" width={240}>
            {({ close }) => <ItemDoMenu disabled={!estado.pronto} icone={<RotateCcw />} onClick={() => { close(); setRestaurar(true); }}>Restaurar dados de teste</ItemDoMenu>}
          </MenuDeMaisAcoes>
        </div>
        <Accordion
          className="mb-6 rounded-lg border border-border bg-surface"
          classeDoCabecalho="w-full p-4 hover:bg-surface-hover"
          classeDoConteudo="border-t border-border p-4"
          chevron="fim"
          titulo={<span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span><span className="block text-label font-semibold text-fg">{empresa.nome}</span><span className="mt-1 block text-ui text-fg-secondary">{empresa.estabelecimentos.find((e) => e.id === cenario.contexto.estabelecimentoId)?.nome ?? "Todos os estabelecimentos"} · {cenario.contexto.competencia.split("-").reverse().join("/")}</span></span>
            <span className="text-ui font-medium text-brand">Alterar empresa ou período</span>
          </span>}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label htmlFor="fiscal-empresa" className="text-helper text-fg-secondary">Empresa de teste
              <Select id="fiscal-empresa" aria-label="Empresa de teste" className={`${classeSelectFiscal} mt-1.5`} disabled={!estado.pronto} value={empresa.id} onChange={(e) => simular({ tipo: "contexto", contexto: { ...cenario.contexto, empresaId: e.target.value, estabelecimentoId: "" } })}>
                {cenario.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Select>
            </label>
            <label htmlFor="fiscal-estabelecimento" className="text-helper text-fg-secondary">Estabelecimento
              <Select id="fiscal-estabelecimento" aria-label="Estabelecimento" className={`${classeSelectFiscal} mt-1.5`} disabled={!estado.pronto} value={cenario.contexto.estabelecimentoId} onChange={(e) => simular({ tipo: "contexto", contexto: { ...cenario.contexto, estabelecimentoId: e.target.value } })}>
                <option value="">Todos os estabelecimentos</option>
                {empresa.estabelecimentos.map((e) => <option key={e.id} value={e.id}>{e.nome} · {e.uf}</option>)}
              </Select>
            </label>
            <label htmlFor="fiscal-competencia" className="text-helper text-fg-secondary">Competência
              <Select id="fiscal-competencia" aria-label="Competência" className={`${classeSelectFiscal} mt-1.5`} disabled={!estado.pronto} value={cenario.contexto.competencia} onChange={(e) => simular({ tipo: "contexto", contexto: { ...cenario.contexto, competencia: e.target.value } })}>
                {COMPETENCIAS.map((c) => <option key={c} value={c}>{c.split("-").reverse().join("/")}</option>)}
              </Select>
            </label>
          </div>
        </Accordion>
        {estado.resultado && <div role={estado.resultado.erro ? "alert" : "status"} className={`mb-5 rounded-md border p-3 text-ui ${estado.resultado.erro ? "border-warning/40 bg-warning-bg text-warning-fg" : "border-info/30 bg-info-bg text-fg"}`}>{estado.resultado.mensagem}</div>}
        {estado.pronto && revisoes > 0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-bg p-3 text-ui text-warning-fg"><span>{revisoes} versão(ões) de teste precisam de revisão: os dados mudaram após a geração.</span>{modulos.includes("fiscal_entregas") && <Button href="/fiscal/entregas" variant="secondary" size="sm">Revisar e gerar nova versão</Button>}</div>}
        {estado.pronto ? children : <Card className="p-8 text-ui text-fg-secondary" role="status">Carregando seu cenário de teste…</Card>}
        <p className="mt-7 text-helper text-fg-muted">Prévia visual do Fiscal · cálculos, arquivos e protocolos demonstrativos.</p>
      </PageContainer>
      <Modal open={!!previa} title={previa?.titulo} onClose={() => setPrevia(null)} maxWidth="max-w-3xl">
        <p className="mb-4 mt-1 text-helper text-fg-secondary">Modo de teste · esta prévia usa apenas informações fictícias.</p>
        {previa?.conteudo}
        {estado.resultado && <p role={estado.resultado.erro ? "alert" : "status"} className={`mt-4 rounded-md border border-border p-3 text-ui ${estado.resultado.erro ? "text-warning-fg" : "text-success-fg"}`}>{estado.resultado.mensagem}</p>}
        <Button variant="secondary" className="mt-5" onClick={() => setPrevia(null)}>Fechar prévia</Button>
      </Modal>
      <Modal open={restaurar} title="Restaurar dados de teste" onClose={() => setRestaurar(false)}>
        <p className="my-4 text-ui text-fg-secondary">As alterações fictícias deste usuário e escritório serão substituídas pelo cenário inicial.</p>
        <Button onClick={() => { dispatch({ tipo: "restaurar" }); setRestaurar(false); }}>Restaurar cenário inicial<ArrowRight size={14} /></Button>
      </Modal>
    </FiscalContext.Provider>
  );
}
