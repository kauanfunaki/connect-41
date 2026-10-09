"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Blocks, Download, ExternalLink, FolderInput } from "lucide-react";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { formatarBytes } from "@/lib/fileSize";
import { formatInstantDateTime } from "@/lib/format";
import { enderecoDaPasta, type DestinoNaTela } from "@/lib/drive/tela";
import type { GrupoDoConnect, ItemDoConnect } from "@/lib/drive/doConnect";
import { guardarDoConnect } from "@/app/(app)/arquivos/actions";
import { IconeDoArquivo } from "./IconeDoArquivo";
import { DialogoDeGuardar } from "./DialogosDoDrive";

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/**
 * "Do Connect" (09/10/2026): os anexos que já estão nos módulos para esta
 * empresa, por origem. Só leitura — cada um continua onde mora e é baixado pela
 * rota do módulo. "Guardar numa pasta" copia para uma pasta de verdade.
 */
export function PastaDoConnect({
  grupos,
  destinos,
  base,
}: {
  grupos: GrupoDoConnect[];
  destinos: DestinoNaTela[];
  base: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [guardando, setGuardando] = useState<ItemDoConnect | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="[&>nav]:mb-0">
        <Breadcrumb items={[{ label: "Pastas da empresa", href: enderecoDaPasta(base, null) }, { label: "Do Connect" }]} />
      </div>
      <p className="text-fs-3 text-fg-secondary">
        Os anexos que já estão nos módulos — solicitações, pendências, processos, envios e os documentos da ficha. Eles continuam onde estão; para
        organizar, use “Guardar numa pasta”.
      </p>

      {total === 0 ? (
        <EmptyState icon={<Blocks />} title="Nenhum anexo nos módulos" description="Quando esta empresa tiver anexos nas solicitações, pendências, processos ou envios, eles aparecem aqui." />
      ) : (
        <div className="flex flex-col gap-2">
          {grupos.map((g) => (
            <BlocoRecolhivel
              key={g.origem}
              titulo={g.rotulo}
              resumo={g.itens.length === 1 ? "1 arquivo" : `${g.itens.length} arquivos`}
              className="bg-surface"
              classeDoConteudo="p-0"
            >
              <ul className="divide-y divide-border border-t border-border">
                {g.itens.map((item) => (
                  <li key={`${item.origem}-${item.id}`} className="flex items-center gap-3 px-3 py-2.5">
                    <IconeDoArquivo nome={item.nome} />
                    <div className="min-w-0 flex-1">
                      <a href={item.baixar} className="block text-fs-3 font-medium text-fg hover:text-brand transition-colors truncate" title="Baixar">
                        {item.nome}
                      </a>
                      <p className="text-micro text-fg-muted truncate">
                        {item.abrirNaOrigem ? (
                          <Link href={item.abrirNaOrigem} className="hover:text-brand">
                            {item.contexto}
                          </Link>
                        ) : (
                          item.contexto
                        )}{" "}
                        · {item.tamanho !== null ? `${formatarBytes(item.tamanho)} · ` : ""}
                        {item.peloCliente ? "enviado pelo cliente" : item.enviadoPor ?? "—"} · {formatInstantDateTime(new Date(item.enviadoEm), QUANDO)}
                      </p>
                    </div>
                    <MenuDeMaisAcoes rotulo={`Ações de ${item.nome}`}>
                      <ItemDoMenu icone={<Download size={14} />} href={item.baixar}>
                        Baixar
                      </ItemDoMenu>
                      {item.abrirNaOrigem && (
                        <ItemDoMenu icone={<ExternalLink size={14} />} href={item.abrirNaOrigem}>
                          Abrir na origem
                        </ItemDoMenu>
                      )}
                      {destinos.length > 0 && (
                        <ItemDoMenu
                          icone={<FolderInput size={14} />}
                          onClick={() => {
                            setErro(null);
                            setGuardando(item);
                          }}
                        >
                          Guardar numa pasta
                        </ItemDoMenu>
                      )}
                    </MenuDeMaisAcoes>
                  </li>
                ))}
              </ul>
            </BlocoRecolhivel>
          ))}
        </div>
      )}

      {guardando && (
        <DialogoDeGuardar
          open
          onClose={() => setGuardando(null)}
          arquivoNome={guardando.nome}
          destinos={destinos}
          erro={erro}
          pendente={pendente}
          onSalvar={(pastaId) =>
            startTransition(async () => {
              setErro(null);
              const r = await guardarDoConnect(guardando.origem, guardando.id, pastaId);
              if ("error" in r) {
                setErro(r.error);
                return;
              }
              setGuardando(null);
              toast.success("Cópia guardada na pasta.");
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}
