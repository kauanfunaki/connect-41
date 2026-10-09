"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Folder, FolderLock, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import type { SetorNaTela } from "@/lib/drive/tela";
import {
  alternarPastaDoModelo,
  criarPastaDoModelo,
  editarPastaDoModelo,
  moverPastaDoModelo,
  type ResultadoDoModelo,
} from "@/app/(app)/admin/arquivos/actions";

type PastaDoModeloNaTela = {
  id: string;
  nome: string;
  setor: string | null;
  setorRotulo: string | null;
  compartilhada: boolean;
  ativa: boolean;
};

export function ModeloDePastas({ pastas, setores }: { pastas: PastaDoModeloNaTela[]; setores: SetorNaTela[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editando, setEditando] = useState<PastaDoModeloNaTela | "nova" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function rodar(acao: () => Promise<ResultadoDoModelo>, sucesso: string | null, fechar = false) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if ("error" in r) {
        if (fechar) setErro(r.error);
        else toast.error(r.error);
        return;
      }
      if (fechar) setEditando(null);
      if (sucesso) toast.success(sucesso);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setErro(null);
            setEditando("nova");
          }}
        >
          <Plus size={14} /> Nova pasta no modelo
        </Button>
      </div>

      <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
        {pastas.map((p, i) => {
          const Icone = p.setor ? FolderLock : Folder;
          return (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${p.ativa ? "" : "opacity-60"}`}>
              <Icone size={18} className="text-fg-muted shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-fs-3 font-medium text-fg">{p.nome}</span>
                {p.setorRotulo && <Selo tom="atencao">Só {p.setorRotulo}</Selo>}
                {p.compartilhada && (
                  <Selo tom="marca">
                    <Users size={10} aria-hidden /> Nasce no portal
                  </Selo>
                )}
                {!p.ativa && <Selo tom="neutro">Desligada</Selo>}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Subir ${p.nome}`}
                  disabled={i === 0 || pendente}
                  onClick={() => rodar(() => moverPastaDoModelo(p.id, "subir"), null)}
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Descer ${p.nome}`}
                  disabled={i === pastas.length - 1 || pendente}
                  onClick={() => rodar(() => moverPastaDoModelo(p.id, "descer"), null)}
                >
                  <ArrowDown size={14} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    setErro(null);
                    setEditando(p);
                  }}
                >
                  <Pencil size={12} /> Editar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  disabled={pendente}
                  onClick={() => rodar(() => alternarPastaDoModelo(p.id), p.ativa ? "Pasta desligada no modelo." : "Pasta ligada no modelo.")}
                >
                  {p.ativa ? "Desligar" : "Ligar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-micro text-fg-muted">
        Além destas, toda empresa tem “Enviados pelo cliente”, onde cai o que o cliente manda pelo portal. Desligar uma pasta do modelo não tira a pasta de quem já tem.
      </p>

      {editando && (
        <FormularioDoModelo
          key={editando === "nova" ? "nova" : editando.id}
          inicial={editando === "nova" ? null : editando}
          setores={setores}
          erro={erro}
          pendente={pendente}
          onClose={() => setEditando(null)}
          onSalvar={(dados) =>
            rodar(
              () => (editando === "nova" ? criarPastaDoModelo(dados) : editarPastaDoModelo(editando.id, dados)),
              editando === "nova" ? "Pasta incluída no modelo." : "Pasta do modelo atualizada.",
              true
            )
          }
        />
      )}
    </div>
  );
}

function FormularioDoModelo({
  inicial,
  setores,
  erro,
  pendente,
  onClose,
  onSalvar,
}: {
  inicial: PastaDoModeloNaTela | null;
  setores: SetorNaTela[];
  erro: string | null;
  pendente: boolean;
  onClose: () => void;
  onSalvar: (dados: { nome: string; setor: string | null; compartilhada: boolean }) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [setor, setSetor] = useState(inicial?.setor ?? "");
  const [compartilhada, setCompartilhada] = useState(inicial?.compartilhada ?? false);
  return (
    <Modal open onClose={onClose} title={inicial ? "Editar pasta do modelo" : "Nova pasta no modelo"}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar({ nome, setor: setor || null, compartilhada });
        }}
      >
        <CampoForm label="Nome" htmlFor="modelo-nome" required>
          <Input id="modelo-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
        </CampoForm>
        <CampoForm label="Quem vê" htmlFor="modelo-setor" helper="Pasta de um setor só aparece para quem é do setor, em todas as empresas.">
          <Select id="modelo-setor" value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos que veem a empresa</option>
            {setores.map((s) => (
              <option key={s.code} value={s.code}>
                Só {s.label}
              </option>
            ))}
          </Select>
        </CampoForm>
        <Checkbox
          id="modelo-compartilhada"
          checked={compartilhada}
          onChange={(e) => setCompartilhada(e.target.checked)}
          label="Nasce compartilhada com o cliente"
          helper="Vale para as empresas que ganharem a pasta daqui em diante. Em cada empresa a equipe pode mudar."
        />
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" loading={pendente} disabled={!nome.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
