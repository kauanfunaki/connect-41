"use client";

import { useState, useTransition } from "react";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatarNcm } from "@/lib/fiscal/cadastro/regras";
import { excluirVinculoDoNcm, salvarVinculoDoNcm } from "@/app/(app)/documentos-fiscais/cadastro/actions";

export type VinculoNaTela = { id: string; ncm: string; cClassTrib: string; cstIbsCbs: string | null; observacao: string | null; atualizadoPor: string; atualizadoEm: string };

type Rascunho = { ncm: string; cClassTrib: string; cstIbsCbs: string; observacao: string };

function Formulario({ inicial, travarNcm, aoFechar }: { inicial: Rascunho; travarNcm: boolean; aoFechar: () => void }) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  function salvar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarVinculoDoNcm(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Vínculo salvo.");
      aoFechar();
    });
  }
  return (
    <form action={salvar} className="flex flex-col gap-4">
      <FieldGrid>
        <CampoForm label="NCM" htmlFor="vinc-ncm" required>
          <Input id="vinc-ncm" name="ncm" defaultValue={formatarNcm(inicial.ncm)} inputMode="numeric" maxLength={10} required readOnly={travarNcm} />
        </CampoForm>
        <CampoForm label="cClassTrib" htmlFor="vinc-cct" required>
          <Input id="vinc-cct" name="cClassTrib" defaultValue={inicial.cClassTrib} inputMode="numeric" maxLength={6} required placeholder="000001" />
        </CampoForm>
        <CampoForm label="CST de IBS/CBS" htmlFor="vinc-cst">
          <Input id="vinc-cst" name="cstIbsCbs" defaultValue={inicial.cstIbsCbs} inputMode="numeric" maxLength={3} placeholder="000" />
        </CampoForm>
      </FieldGrid>
      <CampoForm label="Observação" htmlFor="vinc-obs" dica="Por que este cClassTrib, ou a fonte da classificação.">
        <Input id="vinc-obs" name="observacao" defaultValue={inicial.observacao} maxLength={200} />
      </CampoForm>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} loadingLabel="Salvando…">
          Salvar
        </Button>
      </div>
    </form>
  );
}

/**
 * O vínculo do NCM com o cClassTrib do IBS/CBS (27/11/2026, funcionalidade-899):
 * do escritório, vale para todo produto com o NCM que não tem cClassTrib próprio.
 * Ao lado, os NCMs da empresa que ainda não têm vínculo, dos mais usados.
 */
export function VinculosDoNcm({ vinculos, semVinculo }: { vinculos: VinculoNaTela[]; semVinculo: { ncm: string; produtos: number }[] }) {
  const { dialog, requestConfirm } = useConfirm();
  const [editando, setEditando] = useState<{ inicial: Rascunho; travar: boolean } | null>(null);

  function excluir(v: VinculoNaTela) {
    requestConfirm(
      { title: `Excluir o vínculo do NCM ${formatarNcm(v.ncm)}?`, description: "Os produtos com este NCM e sem cClassTrib próprio ficam sem classificação.", confirmLabel: "Excluir", destructive: true },
      async () => {
        const r = await excluirVinculoDoNcm(v.id);
        return r.ok ? null : { error: r.erro };
      }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" onClick={() => setEditando({ inicial: { ncm: "", cClassTrib: "", cstIbsCbs: "", observacao: "" }, travar: false })}>
          <Plus size={13} aria-hidden /> Novo vínculo
        </Button>
      </div>

      {semVinculo.length > 0 && (
        <div className="rounded-lg border border-border-soft p-3 flex flex-col gap-2">
          <p className="text-fs-2 text-fg-secondary">NCMs desta empresa sem vínculo e sem cClassTrib no produto, dos mais usados:</p>
          <ul className="flex flex-wrap gap-2">
            {semVinculo.map((s) => (
              <li key={s.ncm}>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setEditando({ inicial: { ncm: s.ncm, cClassTrib: "", cstIbsCbs: "", observacao: "" }, travar: true })}
                >
                  <Link2 size={11} aria-hidden /> {formatarNcm(s.ncm)} · {s.produtos} {s.produtos === 1 ? "produto" : "produtos"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vinculos.length === 0 ? (
        <EmptyState icon={<Link2 />} title="Nenhum vínculo" description="Vincule o NCM ao cClassTrib do IBS/CBS: todo produto com o NCM e sem cClassTrib próprio passa a usar este." />
      ) : (
        <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr>
                {["NCM", "cClassTrib", "CST", "Observação", "Atualizado", ""].map((c, i) => (
                  <th key={i} className="px-3 py-2">
                    {c || <span className="sr-only">Ações</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vinculos.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-2 tabular-nums">{formatarNcm(v.ncm)}</td>
                  <td className="px-3 py-2 tabular-nums">{v.cClassTrib}</td>
                  <td className="px-3 py-2 tabular-nums">{v.cstIbsCbs ?? "—"}</td>
                  <td className="px-3 py-2">{v.observacao ?? "—"}</td>
                  <td className="px-3 py-2">
                    {v.atualizadoEm} · {v.atualizadoPor}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={`Editar o vínculo do NCM ${formatarNcm(v.ncm)}`}
                      onClick={() => setEditando({ inicial: { ncm: v.ncm, cClassTrib: v.cClassTrib, cstIbsCbs: v.cstIbsCbs ?? "", observacao: v.observacao ?? "" }, travar: true })}
                    >
                      <Pencil size={12} aria-hidden />
                    </Button>
                    <Button size="xs" variant="ghost" aria-label={`Excluir o vínculo do NCM ${formatarNcm(v.ncm)}`} onClick={() => excluir(v)}>
                      <Trash2 size={12} aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editando !== null} onClose={() => setEditando(null)} title="Vínculo do NCM com o cClassTrib" maxWidth="max-w-xl">
        {editando && <Formulario key={editando.inicial.ncm || "novo"} inicial={editando.inicial} travarNcm={editando.travar} aoFechar={() => setEditando(null)} />}
      </Modal>
      {dialog}
    </div>
  );
}
