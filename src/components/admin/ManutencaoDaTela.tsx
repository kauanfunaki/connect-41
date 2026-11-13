"use client";

import { useActionState, useId, useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Textarea } from "@/components/ui/Textarea";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { FormFooter } from "@/components/ui/FormFooter";
import { useConfirm } from "@/components/ui/useConfirm";
import { MOTIVO_MAXIMO } from "@/lib/manutencao/regras";
import { VALIDADE_MS } from "@/lib/manutencao/noProxy";

type Recusa = { error: string } | void;

/** O que já está gravado, quando a tela está em manutenção. */
export type ManutencaoGravada = {
  motivo: string | null;
  /** "AAAA-MM-DDTHH:mm" no horário de São Paulo, para o campo de data e hora. */
  previsao: string;
};

const SEGUNDOS = Math.round(VALIDADE_MS / 1000);

/**
 * Manutenção de uma tela (13/11/2026), na linha do módulo em Setores e
 * módulos. Fora de manutenção, um botão só ("Manutenção"); em manutenção, os
 * dois gestos que fazem sentido ali: mudar o aviso e liberar. Colocar abre a
 * janela com o aviso para a equipe e a previsão, os dois opcionais — a pressa
 * de tirar uma tela do ar não pode esperar texto.
 */
export function ManutencaoDaTela({
  nome,
  gravada,
  disponivel,
  colocar,
  liberar,
}: {
  nome: string;
  gravada: ManutencaoGravada | null;
  /** `false`: falta a migration — o botão explica em vez de abrir a janela. */
  disponivel: boolean;
  colocar: (dados: { motivo: string; previsao: string }) => Promise<Recusa>;
  liberar: () => Promise<Recusa>;
}) {
  const [aberto, setAberto] = useState(false);
  const { dialog, requestConfirm } = useConfirm();

  function pedirLiberacao() {
    requestConfirm(
      {
        title: `Liberar "${nome}"?`,
        description: `A tela volta a abrir para todos os setores em até ${SEGUNDOS} segundos.`,
        confirmLabel: "Liberar a tela",
      },
      liberar,
    );
  }

  return (
    <>
      {gravada ? (
        <>
          <Button variant="secondary" size="xs" onClick={() => setAberto(true)} className="whitespace-nowrap">
            Editar aviso
          </Button>
          <Button variant="secondary" size="xs" onClick={pedirLiberacao} className="whitespace-nowrap">
            Liberar
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setAberto(true)}
          disabled={!disponivel}
          title={disponivel ? undefined : "Falta atualizar o banco (migration) para usar a manutenção."}
          className="whitespace-nowrap"
        >
          <Wrench size={12} /> Manutenção
        </Button>
      )}
      <Modal open={aberto} onClose={() => setAberto(false)} title={gravada ? `Aviso de manutenção: ${nome}` : `Colocar "${nome}" em manutenção`}>
        {/* Remonta a cada abertura: a janela parte sempre do que está salvo. */}
        {aberto && <FormularioDaManutencao gravada={gravada} colocar={colocar} onFechar={() => setAberto(false)} />}
      </Modal>
      {dialog}
    </>
  );
}

function FormularioDaManutencao({
  gravada,
  colocar,
  onFechar,
}: {
  gravada: ManutencaoGravada | null;
  colocar: (dados: { motivo: string; previsao: string }) => Promise<Recusa>;
  onFechar: () => void;
}) {
  const id = useId();
  const [motivo, setMotivo] = useState(gravada?.motivo ?? "");
  const [estado, enviar, enviando] = useActionState<{ error: string } | null, FormData>(async (_anterior, form) => {
    const r = await colocar({ motivo: String(form.get("motivo") ?? ""), previsao: String(form.get("previsao") ?? "") });
    if (r?.error) return { error: r.error };
    onFechar();
    return null;
  }, null);

  return (
    <form action={enviar} className="space-y-4">
      {!gravada && (
        <p className="text-body text-fg-secondary">
          A tela fica bloqueada para todos, com o aviso de manutenção no lugar dela. A Tech e os administradores podem abri-la só para
          si, pelo próprio aviso, para testar a correção. Vale em até {SEGUNDOS} segundos.
        </p>
      )}
      <CampoForm
        label="Aviso para a equipe"
        htmlFor={`${id}-motivo`}
        helper={`Opcional. Aparece no aviso: o que está sendo corrigido, em poucas palavras. ${motivo.length}/${MOTIVO_MAXIMO}`}
      >
        <Textarea
          id={`${id}-motivo`}
          name="motivo"
          rows={3}
          maxLength={MOTIVO_MAXIMO}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: o saldo do extrato está somando duas vezes as tarifas."
        />
      </CampoForm>
      <CampoForm label="Previsão de volta" htmlFor={`${id}-previsao`} helper="Opcional. Sem previsão, o aviso diz “Sem previsão ainda”.">
        <CampoDataHora id={`${id}-previsao`} name="previsao" defaultValue={gravada?.previsao ?? ""} />
      </CampoForm>
      <FormFooter
        pending={enviando}
        onCancel={onFechar}
        erro={estado?.error}
        submitLabel={gravada ? "Salvar aviso" : "Colocar em manutenção"}
        pendingLabel={gravada ? "Salvando…" : "Colocando…"}
      />
    </form>
  );
}
