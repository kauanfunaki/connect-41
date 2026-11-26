"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { SeletorDeSetores } from "@/components/ui/SeletorDeSetores";
import { useConfirm } from "@/components/ui/useConfirm";

type Setor = { value: string; label: string; cor?: string; ligado: boolean };

/**
 * "Também em…" de um módulo (21/10/2026): os outros setores que usam a mesma
 * tela, ao lado de "Mover para…". Marcar põe a tela no menu daquele setor e
 * libera quem é dele; desmarcar tira. O setor dono não muda — para isso há o
 * "Mover para…". Grava na hora, com a confirmação de sempre, porque mexe em
 * quem abre a tela.
 */
export function TambemEmSetores({
  nome,
  setores,
  disponivel,
  action,
}: {
  nome: string;
  /** Os setores ativos, fora o dono. */
  setores: Setor[];
  /** `false` quando a tabela ainda não existe (deploy antes da migration). */
  disponivel: boolean;
  action: (sectorCode: string, ligar: boolean) => Promise<{ error: string } | void>;
}) {
  const { dialog, requestConfirm } = useConfirm();
  if (setores.length === 0) return null;
  const ligados = setores.filter((s) => s.ligado).map((s) => s.value);
  const quantos = ligados.length;

  function pedir(setor: Setor) {
    const ligar = !setor.ligado;
    requestConfirm(
      ligar
        ? {
            title: `Mostrar "${nome}" também em ${setor.label}?`,
            description: `A tela entra no menu de ${setor.label}, e quem é desse setor passa a abrir, com a mesma permissão que tem no setor. O endereço e os dados não mudam.`,
            confirmLabel: "Mostrar",
          }
        : {
            title: `Tirar "${nome}" de ${setor.label}?`,
            description: `A tela sai do menu de ${setor.label}, e quem é só desse setor perde o acesso. Os dados não mudam.`,
            confirmLabel: "Tirar",
            destructive: true,
          },
      () => action(setor.value, ligar)
    );
  }

  return (
    <>
      <Popover
        align="right"
        width={280}
        aria-label={`Outros setores que usam ${nome}`}
        trigger={({ open, toggle }) => (
          <Button
            variant="secondary"
            size="xs"
            onClick={toggle}
            aria-expanded={open}
            disabled={!disponivel}
            title={disponivel ? undefined : "Ainda não dá para salvar: falta atualizar o banco (migration)."}
            className="whitespace-nowrap"
          >
            <Share2 size={12} /> {quantos > 0 ? `Compartilhado com ${quantos}` : "Compartilhar"}
          </Button>
        )}
      >
        {({ close }) => (
          // O seletor de setores padrão (25/11/2026, melhoria-812), sem "Todos" e
          // "Nenhum": cada setor grava na hora, com a confirmação de sempre.
          <SeletorDeSetores
            rotulo="Também em"
            estiloDoRotulo="painel"
            todosENenhum={false}
            opcoes={setores.map((s) => ({ value: s.value, label: s.label, cor: s.cor }))}
            valor={ligados}
            onChange={(novos) => {
              const mudou = setores.find((s) => novos.includes(s.value) !== s.ligado);
              if (!mudou) return;
              close();
              pedir(mudou);
            }}
            classeDaLista="max-h-56"
            className="p-1"
          />
        )}
      </Popover>
      {dialog}
    </>
  );
}
