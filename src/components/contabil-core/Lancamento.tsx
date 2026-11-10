"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { alterarComposicaoAction, obterComposicaoAction, reclassificarAction } from "@/app/(app)/contabil-core/actions";
import { valorDoComponente } from "@/lib/contabil-core/motor/fila";
import { dec, igual, somaTodos, texto as textoDec, type Dec } from "@/lib/contabil-core/motor/decimal";
import { moeda } from "@/lib/contabil-core/tela";

// Trocar a classificação de uma transação já lançada (Fase 3, 09/11/2026): reclassificar (uma conta
// nova, sem desfazer e refazer à mão) e compor em vários pares (ADR-017: juros, multa e principal da
// mesma linha do banco). As duas pedem motivo, que vai para as partidas canceladas e para a auditoria.

export function Reclassificar({ empresaId, transacaoId, contas }: { empresaId: string; transacaoId: string; contas: Opcao[] }) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function enviar(form: FormData) {
    setErro(null);
    const dados = Object.fromEntries(["contaId", "descricao", "motivo"].map((k) => [k, String(form.get(k) ?? "")]));
    startTransition(async () => {
      const r = await reclassificarAction(empresaId, { ...dados, transacaoId });
      if ("error" in r) return setErro(r.error);
      setAberto(false);
      toast.success("Transação reclassificada.");
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="xs" variant="ghost" onClick={() => setAberto(true)}>
        Reclassificar
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Reclassificar a transação" maxWidth="max-w-lg">
        <form action={enviar} className="flex flex-col gap-4">
          <CampoForm label="Conta contábil" htmlFor={`${base}-conta`} required>
            <SearchableSelect id={`${base}-conta`} name="contaId" options={contas} placeholder="Escolha a conta" />
          </CampoForm>
          <CampoForm label="Histórico do lançamento" htmlFor={`${base}-hist`} required>
            <Input id={`${base}-hist`} name="descricao" maxLength={500} autoComplete="off" required />
          </CampoForm>
          <CampoForm label="Motivo" htmlFor={`${base}-mot`} required helper="Fica nas partidas canceladas e na auditoria.">
            <Input id={`${base}-mot`} name="motivo" maxLength={300} autoComplete="off" required />
          </CampoForm>
          {erro && (
            <p role="alert" className="text-helper text-danger">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" loading={pendente}>
              Reclassificar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

type Linha = { contaId: string; historico: string; valor: string };

export function Compor({ empresaId, transacaoId, contas }: { empresaId: string; transacaoId: string; contas: Opcao[] }) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [motivo, setMotivo] = useState("");
  const [cabecalho, setCabecalho] = useState<{ historico: string; valor: string; vigente: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  async function abrir() {
    setAberto(true);
    setErro(null);
    setCarregando(true);
    const r = await obterComposicaoAction(empresaId, transacaoId);
    setCarregando(false);
    if ("error" in r) return setErro(r.error);
    const c = r.composicao;
    setCabecalho({ historico: c.historico, valor: c.valor, vigente: c.lancamentoVigenteId });
    setLinhas(c.componentes.map((x) => ({ contaId: x.contaId, historico: x.historico, valor: x.valor.replace(".", ",") })));
  }

  const valores = linhas.map((l) => valorDoComponente(l.valor));
  const total: Dec | null = valores.every((v): v is Dec => v !== null) ? somaTodos(valores as Dec[]) : null;
  const fecha = !!cabecalho && total !== null && igual(total, dec(cabecalho.valor));
  const muda = (i: number, campo: keyof Linha, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));

  function salvar() {
    if (!cabecalho) return;
    setErro(null);
    startTransition(async () => {
      const r = await alterarComposicaoAction(empresaId, { transacaoId, lancamentoVigenteId: cabecalho.vigente, motivo, componentes: linhas });
      if ("error" in r) return setErro(r.error);
      setAberto(false);
      toast.success("Composição salva.");
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="xs" variant="ghost" onClick={abrir}>
        Compor
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Compor a transação em vários lançamentos" maxWidth="max-w-3xl">
        {carregando ? (
          <p className="text-sm text-fg-muted">Carregando…</p>
        ) : cabecalho ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {cabecalho.historico} · <strong>{moeda(cabecalho.valor)}</strong>
            </p>
            {linhas.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1.4fr_0.8fr_auto] sm:items-end">
                <CampoForm label={i === 0 ? "Conta" : ""} htmlFor={`${base}-c${i}`}>
                  <SearchableSelect id={`${base}-c${i}`} name={`conta${i}`} options={contas} defaultValue={l.contaId} onChange={(v) => muda(i, "contaId", v)} placeholder="Conta" />
                </CampoForm>
                <CampoForm label={i === 0 ? "Histórico" : ""} htmlFor={`${base}-h${i}`}>
                  <Input id={`${base}-h${i}`} value={l.historico} onChange={(e) => muda(i, "historico", e.target.value)} maxLength={500} autoComplete="off" />
                </CampoForm>
                <CampoForm label={i === 0 ? "Valor" : ""} htmlFor={`${base}-v${i}`}>
                  <Input id={`${base}-v${i}`} value={l.valor} onChange={(e) => muda(i, "valor", e.target.value)} inputMode="decimal" autoComplete="off" />
                </CampoForm>
                <Button type="button" size="icon" variant="ghost" aria-label="Tirar componente" disabled={linhas.length === 1} onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setLinhas((ls) => [...ls, { contaId: "", historico: "", valor: "" }])}>
                <Plus size={14} aria-hidden /> Componente
              </Button>
              <span className={`text-sm tabular-nums ${fecha ? "text-success-fg" : "text-danger"}`}>
                Soma: {total ? moeda(textoDec(total)) : "—"} {fecha ? "(fecha)" : "(precisa fechar o valor da transação)"}
              </span>
            </div>
            <CampoForm label="Motivo" htmlFor={`${base}-mot`} required>
              <Input id={`${base}-mot`} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} autoComplete="off" />
            </CampoForm>
            {erro && (
              <p role="alert" className="text-helper text-danger">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button type="button" onClick={salvar} loading={pendente} disabled={!fecha || motivo.trim().length < 3}>
                Salvar composição
              </Button>
            </div>
          </div>
        ) : (
          erro && (
            <p role="alert" className="text-helper text-danger">
              {erro}
            </p>
          )
        )}
      </Modal>
    </>
  );
}
