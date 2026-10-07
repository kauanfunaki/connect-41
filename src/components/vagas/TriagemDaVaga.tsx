"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { pontuarPassoDoLote, salvarRequisitosDaVaga } from "@/app/(app)/vagas/[id]/triagem-actions";
import { CORTES_PADRAO, ROTULO_DA_FAIXA, type Faixa, type Requisito } from "@/lib/recrutamento/triagem";

type Linha = { tipo: Requisito["tipo"]; texto: string; peso: 1 | 2 | 3 };

type Props = {
  vagaId: string;
  requisitos: { versao: number; itens: Requisito[]; corteCompativel: number; corteParcial: number } | null;
  pendentes: number;
  emAndamento: number;
  podeEditar: boolean;
  podePontuar: boolean;
  iaConfigurada: boolean;
};

/**
 * Requisitos da triagem e o lote de pontuação.
 *
 * O lote roda em passos curtos chamados daqui, um atrás do outro, com o
 * andamento na tela — 200 currículos numa requisição só estourariam o tempo
 * dela, e sem andamento o recrutador não sabe se travou.
 */
export function TriagemDaVaga({ vagaId, requisitos, pendentes, emAndamento, podeEditar, podePontuar, iaConfigurada }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(!requisitos && podeEditar);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    requisitos ? requisitos.itens.map(({ tipo, texto, peso }) => ({ tipo, texto, peso })) : [{ tipo: "OBRIGATORIO", texto: "", peso: 2 }],
  );
  const [cortes, setCortes] = useState({
    corteCompativel: String(requisitos?.corteCompativel ?? CORTES_PADRAO.corteCompativel),
    corteParcial: String(requisitos?.corteParcial ?? CORTES_PADRAO.corteParcial),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const [lote, setLote] = useState<{ rodando: boolean; feitas: number; total: number; log: string[] } | null>(null);

  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  function salvar() {
    setErro(null);
    startSalvar(async () => {
      const r = await salvarRequisitosDaVaga(vagaId, { itens: linhas, ...cortes });
      if ("error" in r) setErro(r.error);
      else {
        setEditando(false);
        router.refresh();
      }
    });
  }

  async function rodar(modo: "pendentes" | "todas") {
    const pular: string[] = [];
    const feitas: string[] = [];
    const log: string[] = [];
    let total = modo === "pendentes" ? pendentes : emAndamento;
    setLote({ rodando: true, feitas: 0, total, log });
    for (;;) {
      const r = await pontuarPassoDoLote(vagaId, modo, pular, modo === "todas" ? feitas : []);
      if ("error" in r) {
        log.push(r.error);
        break;
      }
      for (const p of r.processadas) {
        feitas.push(p.id);
        log.push(`${p.nome}: ${p.score} · ${ROTULO_DA_FAIXA[p.faixa as Faixa]}`);
      }
      for (const f of r.falhas) {
        pular.push(f.id);
        log.push(`${f.nome}: não pontuado — ${f.erro}`);
      }
      total = feitas.length + pular.length + r.restantes;
      setLote({ rodando: true, feitas: feitas.length + pular.length, total, log: [...log] });
      if (r.restantes === 0 || (r.processadas.length === 0 && r.falhas.length === 0)) break;
    }
    setLote({ rodando: false, feitas: feitas.length + pular.length, total, log: [...log] });
    router.refresh();
  }

  return (
    <Card className="p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Triagem de currículos</h2>
          <p className="text-[12px] text-fg-muted mt-0.5 max-w-[640px]">
            A IA confere o currículo contra cada requisito e aponta a evidência; a nota sai da tabela abaixo. Ela
            <strong className="font-medium text-fg-secondary"> só ordena os candidatos — nunca reprova ninguém</strong>. Nome, idade, cidade e
            foto não chegam ao pontuador.
          </p>
        </div>
        {requisitos && !editando && podeEditar && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={13} /> Editar requisitos
          </Button>
        )}
      </div>

      {/* Edição no tamanho de formulário (h-9), com cada requisito numa grade
          de colunas fixas: eram controles de barra (h-8) com lixeira de 28px
          numa linha que quebrava onde calhasse, e as notas de corte tinham
          rótulo montado à mão. No celular o texto do requisito desce para a
          linha de baixo, inteiro. */}
      {editando ? (
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">Requisitos</legend>
            {linhas.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_104px_auto] sm:grid-cols-[144px_minmax(0,1fr)_104px_auto] items-center gap-2">
                <Select
                  value={l.tipo}
                  onChange={(e) => muda(i, { tipo: e.target.value as Linha["tipo"] })}
                  aria-label={`Tipo do requisito ${i + 1}`}
                >
                  <option value="OBRIGATORIO">Obrigatório</option>
                  <option value="DESEJAVEL">Desejável</option>
                </Select>
                <Input
                  value={l.texto}
                  maxLength={300}
                  onChange={(e) => muda(i, { texto: e.target.value })}
                  placeholder="Ex.: Experiência com contas a pagar · Excel intermediário · CNH B"
                  aria-label={`Requisito ${i + 1}`}
                  className="col-span-3 order-last sm:col-span-1 sm:order-none"
                />
                <Select
                  value={String(l.peso)}
                  onChange={(e) => muda(i, { peso: Number(e.target.value) as Linha["peso"] })}
                  aria-label={`Peso do requisito ${i + 1}`}
                >
                  <option value="1">Peso 1</option>
                  <option value="2">Peso 2</option>
                  <option value="3">Peso 3</option>
                </Select>
                <Button
                  variant="ghost"
                  className="w-9 px-0!"
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  aria-label={`Remover o requisito ${i + 1}`}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            {/* Botão, e não texto cinza (30/09): é ação do formulário. */}
            <Button variant="secondary" size="sm" onClick={() => setLinhas((ls) => [...ls, { tipo: "DESEJAVEL", texto: "", peso: 2 }])}>
              <Plus size={14} /> Adicionar requisito
            </Button>
          </fieldset>

          <div className="space-y-2">
            <FieldGrid columns="sm:grid-cols-[200px_200px]">
              <CampoForm label="Compatível a partir de" htmlFor="corteCompativel">
                <Input
                  id="corteCompativel"
                  inputMode="numeric"
                  value={cortes.corteCompativel}
                  onChange={(e) => setCortes({ ...cortes, corteCompativel: e.target.value })}
                />
              </CampoForm>
              <CampoForm label="Parcial a partir de" htmlFor="corteParcial">
                <Input
                  id="corteParcial"
                  inputMode="numeric"
                  value={cortes.corteParcial}
                  onChange={(e) => setCortes({ ...cortes, corteParcial: e.target.value })}
                />
              </CampoForm>
            </FieldGrid>
            <p className="text-[length:var(--fs-helper)] text-fg-muted">
              Obrigatório pesa o dobro. Localidade não entra aqui: cidade não é avaliada pela IA, o recrutador confere.
            </p>
          </div>

          {erro && <p className="text-[13px] text-danger">{erro}</p>}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
            {requisitos && (
              <p className="mr-auto text-[12px] text-fg-muted">
                Salvar cria a versão {requisitos.versao + 1}. As notas já dadas continuam no histórico, marcadas como de versão anterior.
              </p>
            )}
            {requisitos && (
              <Button variant="secondary" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            )}
            <Button onClick={salvar} loading={salvando} disabled={salvando}>
              Salvar requisitos
            </Button>
          </div>
        </div>
      ) : requisitos ? (
        <>
          {/* Coluna fixa para o tipo: com `flex`, "Obrigatório" e "Desejável"
              têm larguras diferentes e o texto de cada requisito começava num
              ponto. */}
          <ul className="space-y-1.5 text-[13px] mb-3">
            {requisitos.itens.map((r) => (
              <li key={r.id} className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-baseline gap-x-2">
                {/* O `Selo`, no lugar da pílula à mão (auditoria DRG-06, 07/10/2026); o raio
                    menor, na escala (`rounded-sm`), segue distinguindo o tipo do
                    requisito dos selos de situação (DRG-26). */}
                <Selo tom={r.tipo === "OBRIGATORIO" ? "atencao" : "neutro"} className="justify-self-start rounded-sm!">
                  {r.tipo === "OBRIGATORIO" ? "Obrigatório" : "Desejável"}
                </Selo>
                <span className="text-fg">{r.texto}</span>
                <span className="text-fg-muted text-[11px] tnum">peso {r.peso}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-fg-muted mb-3">
            Versão {requisitos.versao} · Compatível ≥ {requisitos.corteCompativel} · Parcial ≥ {requisitos.corteParcial}
          </p>
          {podePontuar &&
            (iaConfigurada ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!!lote?.rodando || pendentes === 0} onClick={() => rodar("pendentes")}>
                  <Sparkles size={13} /> Pontuar pendentes ({pendentes})
                </Button>
                <Button variant="secondary" size="sm" disabled={!!lote?.rodando || emAndamento === 0} onClick={() => rodar("todas")}>
                  Reprocessar todas ({emAndamento})
                </Button>
              </div>
            ) : (
              <p className="text-[12px] text-fg-muted">Configure a IA em Integrações para pontuar.</p>
            ))}
        </>
      ) : (
        <p className="text-[13px] text-fg-muted">Sem requisitos cadastrados — peça a quem gerencia a vaga.</p>
      )}

      {lote && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
          <p className="text-[12px] font-medium text-fg">
            {lote.rodando ? "Pontuando…" : "Lote concluído"} {lote.feitas}/{lote.total}
          </p>
          <div className="h-1 rounded-full bg-border mt-1.5 overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${lote.total ? (lote.feitas / lote.total) * 100 : 100}%` }} />
          </div>
          {lote.log.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-fg-muted space-y-0.5">
              {lote.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
