"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { formatCnpj, formatCpf } from "@/lib/format";
import { CONTRIBUINTE, REGIMES, ROTULO_DO_CONTRIBUINTE, ROTULO_DO_REGIME, type Regime } from "@/lib/fiscal/cadastro/regras";
import { salvarParticipanteFiscal } from "@/app/(app)/documentos-fiscais/cadastro/actions";

export type ParticipanteNaTela = {
  id: string;
  documento: string;
  nome: string;
  papel: "FORNECEDOR" | "CLIENTE" | "AMBOS";
  uf: string | null;
  inscricaoEstadual: string | null;
  regime: string | null;
  contribuinteIcms: string | null;
  documentos: number;
  ultimaNota: string | null;
};

const PAPEL = { FORNECEDOR: "Fornecedor", CLIENTE: "Cliente", AMBOS: "Fornecedor e cliente" } as const;
const doc = (d: string) => (d.length === 11 ? formatCpf(d) : formatCnpj(d));

function Formulario({ companyId, p, aoFechar }: { companyId: string; p: ParticipanteNaTela; aoFechar: () => void }) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  function salvar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarParticipanteFiscal(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Cadastro salvo.");
      aoFechar();
    });
  }
  return (
    <form action={salvar} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="id" value={p.id} />
      <p className="text-fs-2 text-fg-secondary tabular-nums">
        {doc(p.documento)} · {PAPEL[p.papel]}
      </p>
      <CampoForm label="Nome" htmlFor="part-nome" required>
        <Input id="part-nome" name="nome" defaultValue={p.nome} maxLength={180} required />
      </CampoForm>
      <FieldGrid>
        <CampoForm label="UF" htmlFor="part-uf">
          <Input id="part-uf" name="uf" defaultValue={p.uf ?? ""} maxLength={2} placeholder="PR" />
        </CampoForm>
        <CampoForm label="Inscrição estadual" htmlFor="part-ie">
          <Input id="part-ie" name="inscricaoEstadual" defaultValue={p.inscricaoEstadual ?? ""} maxLength={30} />
        </CampoForm>
        <CampoForm label="Regime" htmlFor="part-regime">
          <Select id="part-regime" name="regime" defaultValue={p.regime ?? ""}>
            <option value="">Não informado</option>
            {REGIMES.map((r) => (
              <option key={r} value={r}>
                {ROTULO_DO_REGIME[r]}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Contribuinte do ICMS" htmlFor="part-contrib">
          <Select id="part-contrib" name="contribuinteIcms" defaultValue={p.contribuinteIcms ?? ""}>
            <option value="">Não informado</option>
            {CONTRIBUINTE.map((c) => (
              <option key={c} value={c}>
                {ROTULO_DO_CONTRIBUINTE[c]}
              </option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>
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

/** Fornecedores e clientes do cadastro fiscal (27/11/2026, funcionalidade-899). */
export function TabelaDeParticipantes({ companyId, participantes }: { companyId: string; participantes: ParticipanteNaTela[] }) {
  const [editando, setEditando] = useState<ParticipanteNaTela | null>(null);
  return (
    <>
      <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[880px]">
          <thead>
            <tr>
              {["Nome", "CNPJ/CPF", "Papel", "UF", "IE", "Regime", "Notas", ""].map((c, i) => (
                <th key={i} className="px-3 py-2">
                  {c || <span className="sr-only">Ações</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participantes.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 text-fg">{p.nome}</td>
                <td className="px-3 py-2 tabular-nums">{doc(p.documento)}</td>
                <td className="px-3 py-2">{PAPEL[p.papel]}</td>
                <td className="px-3 py-2">{p.uf ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{p.inscricaoEstadual ?? "—"}</td>
                <td className="px-3 py-2">{p.regime && p.regime in ROTULO_DO_REGIME ? ROTULO_DO_REGIME[p.regime as Regime] : "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {p.documentos}
                  {p.ultimaNota && <span className="block text-micro text-fg-muted">{p.ultimaNota}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="xs" variant="ghost" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                    <Pencil size={12} aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={editando !== null} onClose={() => setEditando(null)} title="Editar fornecedor ou cliente" maxWidth="max-w-xl">
        {editando && <Formulario key={editando.id} companyId={companyId} p={editando} aoFechar={() => setEditando(null)} />}
      </Modal>
    </>
  );
}
