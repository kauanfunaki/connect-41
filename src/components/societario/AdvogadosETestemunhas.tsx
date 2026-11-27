"use client";

import { useState, useTransition } from "react";
import { Pencil, Power, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatCpf } from "@/lib/format";
import { ROTULO_DO_PAPEL, type PapelDoParticipante } from "@/lib/societario/modelos/campos";
import { ativarParticipanteDoSocietario, excluirParticipanteDoSocietario, salvarParticipanteDoSocietario } from "@/app/(app)/processos/modelos/actions";

export type ParticipanteNaTela = {
  id: string;
  papel: PapelDoParticipante;
  nome: string;
  cpf: string | null;
  rg: string | null;
  oab: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: string | null;
  ativo: boolean;
};

function Formulario({ pessoa, aoFechar }: { pessoa: ParticipanteNaTela | null; aoFechar: () => void }) {
  const toast = useToast();
  const [papel, setPapel] = useState<PapelDoParticipante>(pessoa?.papel ?? "TESTEMUNHA");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarParticipanteDoSocietario(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Cadastro salvo.");
      aoFechar();
    });
  }

  return (
    <form action={salvar} className="flex flex-col gap-4">
      {pessoa && <input type="hidden" name="id" value={pessoa.id} />}
      <RadioGroup<PapelDoParticipante>
        name="papel"
        legenda="Assina como"
        variante="linha"
        valor={papel}
        onChange={setPapel}
        opcoes={[
          { valor: "TESTEMUNHA", rotulo: "Testemunha" },
          { valor: "ADVOGADO", rotulo: "Advogado" },
        ]}
      />
      <CampoForm label="Nome" htmlFor="part-nome" required>
        <Input id="part-nome" name="nome" defaultValue={pessoa?.nome ?? ""} maxLength={180} required />
      </CampoForm>
      <FieldGrid>
        <CampoForm label="CPF" htmlFor="part-cpf">
          <Input id="part-cpf" name="cpf" defaultValue={pessoa?.cpf ? formatCpf(pessoa.cpf) : ""} inputMode="numeric" maxLength={14} />
        </CampoForm>
        <CampoForm label="RG" htmlFor="part-rg">
          <Input id="part-rg" name="rg" defaultValue={pessoa?.rg ?? ""} maxLength={30} />
        </CampoForm>
      </FieldGrid>
      {papel === "ADVOGADO" && (
        <CampoForm label="OAB" htmlFor="part-oab" dica="Como sai no documento: “OAB/PR 12.345”.">
          <Input id="part-oab" name="oab" defaultValue={pessoa?.oab ?? ""} maxLength={30} />
        </CampoForm>
      )}
      <FieldGrid>
        <CampoForm label="Nacionalidade" htmlFor="part-nac">
          <Input id="part-nac" name="nacionalidade" defaultValue={pessoa?.nacionalidade ?? ""} maxLength={60} placeholder="brasileira" />
        </CampoForm>
        <CampoForm label="Estado civil" htmlFor="part-ec">
          <Input id="part-ec" name="estadoCivil" defaultValue={pessoa?.estadoCivil ?? ""} maxLength={40} placeholder="casada" />
        </CampoForm>
      </FieldGrid>
      <CampoForm label="Profissão" htmlFor="part-prof">
        <Input id="part-prof" name="profissao" defaultValue={pessoa?.profissao ?? ""} maxLength={120} />
      </CampoForm>
      <CampoForm label="Endereço" htmlFor="part-end" dica="Numa linha, como sai no documento.">
        <Input id="part-end" name="endereco" defaultValue={pessoa?.endereco ?? ""} maxLength={300} />
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
 * Advogados e testemunhas que assinam os documentos (27/11/2026,
 * funcionalidade-891): o cadastro do escritório, escolhido em cada processo.
 */
export function AdvogadosETestemunhas({ pessoas }: { pessoas: ParticipanteNaTela[] }) {
  const { dialog, requestConfirm } = useConfirm();
  const [editando, setEditando] = useState<ParticipanteNaTela | "novo" | null>(null);

  function ativar(p: ParticipanteNaTela) {
    requestConfirm(
      {
        title: p.ativo ? `Desativar ${p.nome}?` : `Ativar ${p.nome}?`,
        description: p.ativo ? "Sai da lista de quem assina nos processos novos. Onde já está escolhido, continua." : "Volta para a lista de quem assina.",
        confirmLabel: p.ativo ? "Desativar" : "Ativar",
      },
      async () => {
        const r = await ativarParticipanteDoSocietario(p.id, !p.ativo);
        return r.ok ? null : { error: r.erro };
      }
    );
  }

  function excluir(p: ParticipanteNaTela) {
    requestConfirm(
      {
        title: `Excluir ${p.nome}?`,
        description: "Sai também dos processos em que estava escolhido. Os documentos já gerados não mudam.",
        confirmLabel: "Excluir",
        destructive: true,
      },
      async () => {
        const r = await excluirParticipanteDoSocietario(p.id);
        return r.ok ? null : { error: r.erro };
      }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" onClick={() => setEditando("novo")}>
          <UserPlus size={14} aria-hidden /> Cadastrar
        </Button>
      </div>
      {pessoas.length === 0 ? (
        <EmptyState icon={<Users />} title="Ninguém cadastrado" description="Cadastre o advogado e as testemunhas que costumam assinar os contratos e alterações." />
      ) : (
        <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                {["Nome", "Assina como", "CPF", "OAB", ""].map((c, i) => (
                  <th key={i} className="px-3 py-2">
                    {c || <span className="sr-only">Ações</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.id} className={p.ativo ? undefined : "text-fg-muted"}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{p.nome}</span> {!p.ativo && <Selo tom="neutro">Desativado</Selo>}
                  </td>
                  <td className="px-3 py-2">{ROTULO_DO_PAPEL[p.papel]}</td>
                  <td className="px-3 py-2 tabular-nums">{p.cpf ? formatCpf(p.cpf) : "—"}</td>
                  <td className="px-3 py-2">{p.oab ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <MenuDeMaisAcoes rotulo={`Ações de ${p.nome}`} width={200}>
                      <ItemDoMenu icone={<Pencil />} onClick={() => setEditando(p)}>
                        Editar
                      </ItemDoMenu>
                      <ItemDoMenu icone={<Power />} onClick={() => ativar(p)}>
                        {p.ativo ? "Desativar" : "Ativar"}
                      </ItemDoMenu>
                      <ItemDoMenu icone={<Trash2 />} danger onClick={() => excluir(p)}>
                        Excluir
                      </ItemDoMenu>
                    </MenuDeMaisAcoes>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editando !== null} onClose={() => setEditando(null)} title={editando === "novo" ? "Cadastrar advogado ou testemunha" : "Editar cadastro"} maxWidth="max-w-xl">
        {editando !== null && <Formulario key={editando === "novo" ? "novo" : editando.id} pessoa={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      {dialog}
    </div>
  );
}
