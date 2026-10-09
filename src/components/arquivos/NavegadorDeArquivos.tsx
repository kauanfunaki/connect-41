"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Download,
  Eye,
  Folder,
  FolderInput,
  FolderLock,
  FolderOpen,
  FolderPlus,
  Lock,
  MoveRight,
  Pencil,
  Search,
  Share2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatarBytes } from "@/lib/fileSize";
import { formatInstantDateTime } from "@/lib/format";
import { enderecoDaPasta, rotuloDeItens, type ArquivoNaTela, type NavegadorNaTela, type PastaNaTela, type ResultadoDaBusca } from "@/lib/drive/tela";
import {
  alterarSetorDaPasta,
  compartilharPasta,
  criarPasta,
  excluirArquivo,
  excluirPasta,
  moverArquivo,
  moverPasta,
  renomearArquivo,
  renomearPasta,
  type ResultadoDaAcao,
} from "@/app/(app)/arquivos/actions";
import { IconeDoArquivo } from "./IconeDoArquivo";
import { EnvioDeArquivos } from "./EnvioDeArquivos";
import { DialogoDeCompartilhar, DialogoDeMover, DialogoDeNome, DialogoDeSetor } from "./DialogosDoDrive";

type Props = {
  dados: NavegadorNaTela;
  /** A tela onde o navegador está montado, sem `pasta` — "/arquivos/empresa/x" ou "/empresas/x?tab=arquivos". */
  base: string;
  /** O primeiro item da trilha: "Pastas da empresa", "Pastas do escritório". */
  rotuloDaRaiz: string;
  busca?: { termo: string; resultados: ResultadoDaBusca[] } | null;
};

type Dialogo =
  | { tipo: "novaPasta" }
  | { tipo: "renomearPasta"; pasta: PastaNaTela }
  | { tipo: "setorPasta"; pasta: { id: string; setorCode: string | null } }
  | { tipo: "moverPasta"; pasta: { id: string; parentId: string | null } }
  | { tipo: "compartilhar"; pasta: { id: string; nome: string; compartilhada: boolean; compartilhadaPor: string | null; fixa: boolean } }
  | { tipo: "renomearArquivo"; arquivo: ArquivoNaTela }
  | { tipo: "moverArquivo"; arquivo: ArquivoNaTela & { pastaId: string } };

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/** Abrir no navegador (PDF, imagem) ou baixar. */
function enderecoDoArquivo(a: { id: string; previa: boolean }, baixar = false): string {
  return `/api/arquivos/${a.id}${a.previa && !baixar ? "?ver=1" : ""}`;
}

export function NavegadorDeArquivos({ dados, base, rotuloDaRaiz, busca }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { dialog: confirmacao, requestConfirm } = useConfirm();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [termo, setTermo] = useState(busca?.termo ?? "");

  const { pasta, podeMexer } = dados;
  const naEmpresa = dados.empresa !== null;

  function abrir(d: Dialogo) {
    setErro(null);
    setDialogo(d);
  }

  /** Roda a ação; com erro, fica no diálogo mostrando a frase; com sucesso, fecha e avisa. */
  function executar(acao: () => Promise<ResultadoDaAcao>, sucesso: string) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setDialogo(null);
      toast.success(r.aviso ? `${sucesso} ${r.aviso}` : sucesso);
      router.refresh();
    });
  }

  /** Exclusão pede confirmação; o erro da action vira o erro do diálogo de confirmação. */
  function confirmarExclusao(oQue: "pasta" | "arquivo", id: string, nome: string, depois?: () => void) {
    requestConfirm(
      {
        title: `Mandar “${nome}” para a lixeira?`,
        description:
          oQue === "pasta"
            ? "A pasta e tudo que está dentro dela saem da tela e do portal. Fica 30 dias na lixeira, e dá para restaurar."
            : "O arquivo sai da tela e do portal. Fica 30 dias na lixeira, e dá para restaurar.",
        confirmLabel: "Mandar para a lixeira",
        destructive: true,
      },
      async () => {
        const r = oQue === "pasta" ? await excluirPasta(id) : await excluirArquivo(id);
        if ("error" in r) throw new Error(r.error);
        toast.success(oQue === "pasta" ? "Pasta na lixeira." : "Arquivo na lixeira.");
        if (depois) depois();
        else router.refresh();
      }
    );
  }

  const trilha = [
    { label: rotuloDaRaiz, href: pasta ? enderecoDaPasta(base, null) : undefined },
    ...dados.caminho.map((p, i) => ({
      label: p.nome,
      href: i < dados.caminho.length - 1 ? enderecoDaPasta(base, p.id) : undefined,
      truncate: true,
    })),
  ];
  const paiDaAtual = dados.caminho.length > 1 ? dados.caminho[dados.caminho.length - 2].id : null;

  const vazio = dados.subpastas.length === 0 && dados.arquivos.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Trilha, uso e busca */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* O Breadcrumb traz margem de cabeçalho de página; aqui ele divide a linha com a busca. */}
        <div className="min-w-0 flex-1 [&>nav]:mb-0">
          <Breadcrumb items={trilha} />
        </div>
        <span className="text-micro text-fg-muted tabular-nums">
          {dados.uso.arquivos === 1 ? "1 arquivo" : `${dados.uso.arquivos} arquivos`} · {formatarBytes(dados.uso.bytes)}
        </span>
        <form
          role="search"
          className="w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            const t = termo.trim();
            router.push(t ? enderecoDaPasta(base, null, { busca: t }) : enderecoDaPasta(base, pasta?.id ?? null));
          }}
        >
          <Input
            id="drive-busca"
            type="search"
            compact
            icon={<Search size={14} />}
            placeholder={naEmpresa ? "Buscar arquivo na empresa" : "Buscar arquivo"}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            aria-label="Buscar arquivo pelo nome"
          />
        </form>
      </div>

      {busca ? (
        <ResultadosDaBusca busca={busca} base={base} />
      ) : (
        <>
          {/* A pasta aberta: do que ela é, quem vê, e as ações dela */}
          <div className="flex flex-wrap items-center gap-2">
            {pasta?.enviados && (
              <p className="text-fs-3 text-fg-secondary mr-auto">O que o cliente envia pelo portal cai aqui.</p>
            )}
            {pasta && !pasta.enviados && (
              <div className="flex flex-wrap items-center gap-1.5 mr-auto">
                {pasta.setor && (
                  <Selo tom="atencao">
                    <Lock size={11} aria-hidden /> Só {pasta.setor}
                  </Selo>
                )}
                {pasta.compartilhada ? (
                  <Selo tom="marca">
                    <Users size={11} aria-hidden /> Compartilhada com o cliente
                  </Selo>
                ) : pasta.compartilhadaPor ? (
                  <Selo tom="marca">
                    <Users size={11} aria-hidden /> O cliente vê, por “{pasta.compartilhadaPor}”
                  </Selo>
                ) : naEmpresa ? (
                  <span className="text-micro text-fg-muted">Só a equipe vê esta pasta.</span>
                ) : null}
              </div>
            )}
            {!pasta && <div className="mr-auto" />}

            {podeMexer && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => abrir({ tipo: "novaPasta" })}>
                  <FolderPlus size={14} /> Nova pasta
                </Button>
                {pasta && naEmpresa && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      abrir({
                        tipo: "compartilhar",
                        pasta: {
                          id: pasta.id,
                          nome: pasta.nome,
                          compartilhada: pasta.compartilhada,
                          compartilhadaPor: pasta.compartilhadaPor,
                          fixa: pasta.enviados,
                        },
                      })
                    }
                  >
                    <Share2 size={14} /> Compartilhar
                  </Button>
                )}
                {pasta && (
                  <Button type="button" size="sm" onClick={() => setEnviando(true)}>
                    <Upload size={14} /> Enviar arquivos
                  </Button>
                )}
                {pasta && !pasta.daCasa && (
                  <MenuDeMaisAcoes rotulo="Mais ações da pasta" size="md">
                    <ItemDoMenu icone={<Pencil size={14} />} onClick={() => abrir({ tipo: "renomearPasta", pasta: { id: pasta.id, nome: pasta.nome, setor: pasta.setor, setorCode: pasta.setorCode, daCasa: false, enviados: false, compartilhada: pasta.compartilhada, itens: 0 } })}>
                      Renomear
                    </ItemDoMenu>
                    <ItemDoMenu icone={<MoveRight size={14} />} onClick={() => abrir({ tipo: "moverPasta", pasta: { id: pasta.id, parentId: paiDaAtual } })}>
                      Mover
                    </ItemDoMenu>
                    {dados.setores.length > 0 && (
                      <ItemDoMenu icone={<FolderLock size={14} />} onClick={() => abrir({ tipo: "setorPasta", pasta: { id: pasta.id, setorCode: pasta.setorCode } })}>
                        Quem vê
                      </ItemDoMenu>
                    )}
                    <ItemDoMenu
                      icone={<Trash2 size={14} />}
                      danger
                      onClick={() => confirmarExclusao("pasta", pasta.id, pasta.nome, () => router.push(enderecoDaPasta(base, paiDaAtual)))}
                    >
                      Mandar para a lixeira
                    </ItemDoMenu>
                  </MenuDeMaisAcoes>
                )}
              </>
            )}
          </div>

          {enviando && pasta && podeMexer && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <EnvioDeArquivos
                url="/api/arquivos/enviar"
                campos={{ pastaId: pasta.id }}
                dica={
                  pasta.compartilhada || pasta.compartilhadaPor
                    ? "Esta pasta está no portal: o cliente vê o que você enviar."
                    : undefined
                }
                onCancelar={() => setEnviando(false)}
                onTerminou={(ids) => {
                  if (ids.length > 0) toast.success(ids.length === 1 ? "Arquivo enviado." : `${ids.length} arquivos enviados.`);
                  router.refresh();
                }}
              />
            </div>
          )}

          {vazio ? (
            <EmptyState
              icon={<FolderOpen />}
              title={pasta ? "Pasta vazia" : "Nenhuma pasta ainda"}
              description={
                pasta
                  ? podeMexer
                    ? "Envie arquivos ou crie uma pasta dentro desta."
                    : "Nada por aqui ainda."
                  : "Crie a primeira pasta para organizar os arquivos do escritório."
              }
              action={
                podeMexer ? (
                  pasta ? (
                    <Button type="button" size="sm" onClick={() => setEnviando(true)}>
                      <Upload size={14} /> Enviar arquivos
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={() => abrir({ tipo: "novaPasta" })}>
                      <FolderPlus size={14} /> Nova pasta
                    </Button>
                  )
                ) : undefined
              }
            />
          ) : (
            <ul className="bg-surface border border-border rounded-lg divide-y divide-border" aria-label="Pastas e arquivos">
              {dados.subpastas.map((p) => (
                <LinhaDaPasta
                  key={p.id}
                  pasta={p}
                  href={enderecoDaPasta(base, p.id)}
                  podeMexer={podeMexer}
                  naEmpresa={naEmpresa}
                  temSetores={dados.setores.length > 0}
                  onRenomear={() => abrir({ tipo: "renomearPasta", pasta: p })}
                  onMover={() => abrir({ tipo: "moverPasta", pasta: { id: p.id, parentId: pasta?.id ?? null } })}
                  onSetor={() => abrir({ tipo: "setorPasta", pasta: { id: p.id, setorCode: p.setorCode } })}
                  onCompartilhar={() =>
                    abrir({
                      tipo: "compartilhar",
                      pasta: {
                        id: p.id,
                        nome: p.nome,
                        compartilhada: p.compartilhada,
                        compartilhadaPor: pasta?.compartilhada ? pasta.nome : pasta?.compartilhadaPor ?? null,
                        fixa: p.enviados,
                      },
                    })
                  }
                  onExcluir={() => confirmarExclusao("pasta", p.id, p.nome)}
                />
              ))}
              {dados.arquivos.map((a) => (
                <LinhaDoArquivo
                  key={a.id}
                  arquivo={a}
                  podeMexer={podeMexer}
                  mostrarCliente={naEmpresa && !!(pasta?.compartilhada || pasta?.compartilhadaPor)}
                  onRenomear={() => abrir({ tipo: "renomearArquivo", arquivo: a })}
                  onMover={() => pasta && abrir({ tipo: "moverArquivo", arquivo: { ...a, pastaId: pasta.id } })}
                  onExcluir={() => confirmarExclusao("arquivo", a.id, a.nome)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Diálogos: um por vez, montados só quando abertos para começar limpos */}
      {dialogo?.tipo === "novaPasta" && (
        <DialogoDeNome
          open
          onClose={() => setDialogo(null)}
          titulo={pasta ? `Nova pasta em “${pasta.nome}”` : "Nova pasta"}
          rotulo="Criar"
          setores={dados.setores}
          erro={erro}
          pendente={pendente}
          onSalvar={(nome, setor) =>
            executar(() => criarPasta({ companyId: dados.empresa?.id ?? null, parentId: pasta?.id ?? null, nome, setor }), "Pasta criada.")
          }
        />
      )}
      {dialogo?.tipo === "renomearPasta" && (
        <DialogoDeNome
          open
          onClose={() => setDialogo(null)}
          titulo="Renomear pasta"
          rotulo="Salvar"
          inicial={dialogo.pasta.nome}
          erro={erro}
          pendente={pendente}
          onSalvar={(nome) => executar(() => renomearPasta(dialogo.pasta.id, nome), "Pasta renomeada.")}
        />
      )}
      {dialogo?.tipo === "renomearArquivo" && (
        <DialogoDeNome
          open
          onClose={() => setDialogo(null)}
          titulo="Renomear arquivo"
          rotulo="Salvar"
          inicial={dialogo.arquivo.nome}
          erro={erro}
          pendente={pendente}
          onSalvar={(nome) => executar(() => renomearArquivo(dialogo.arquivo.id, nome), "Arquivo renomeado.")}
        />
      )}
      {dialogo?.tipo === "setorPasta" && (
        <DialogoDeSetor
          open
          onClose={() => setDialogo(null)}
          setores={dados.setores}
          atual={dialogo.pasta.setorCode}
          erro={erro}
          pendente={pendente}
          onSalvar={(setor) => executar(() => alterarSetorDaPasta(dialogo.pasta.id, setor), "Pronto.")}
        />
      )}
      {dialogo?.tipo === "moverPasta" && (
        <DialogoDeMover
          open
          onClose={() => setDialogo(null)}
          oQue="pasta"
          destinos={dados.destinos}
          pastaMovida={dialogo.pasta.id}
          atual={dialogo.pasta.parentId}
          erro={erro}
          pendente={pendente}
          onSalvar={(destino) => executar(() => moverPasta(dialogo.pasta.id, destino), "Pasta movida.")}
        />
      )}
      {dialogo?.tipo === "moverArquivo" && (
        <DialogoDeMover
          open
          onClose={() => setDialogo(null)}
          oQue="arquivo"
          destinos={dados.destinos}
          atual={dialogo.arquivo.pastaId}
          erro={erro}
          pendente={pendente}
          onSalvar={(destino) => destino && executar(() => moverArquivo(dialogo.arquivo.id, destino), "Arquivo movido.")}
        />
      )}
      {dialogo?.tipo === "compartilhar" && (
        <DialogoDeCompartilhar
          open
          onClose={() => setDialogo(null)}
          pastaNome={dialogo.pasta.nome}
          compartilhada={dialogo.pasta.compartilhada}
          compartilhadaPor={dialogo.pasta.compartilhadaPor}
          fixa={dialogo.pasta.fixa}
          erro={erro}
          pendente={pendente}
          onSalvar={(compartilhar, avisar) =>
            executar(() => compartilharPasta(dialogo.pasta.id, compartilhar, avisar), compartilhar ? "Pasta no portal do cliente." : "A pasta saiu do portal.")
          }
        />
      )}
      {confirmacao}
    </div>
  );
}

function LinhaDaPasta({
  pasta,
  href,
  podeMexer,
  naEmpresa,
  temSetores,
  onRenomear,
  onMover,
  onSetor,
  onCompartilhar,
  onExcluir,
}: {
  pasta: PastaNaTela;
  href: string;
  podeMexer: boolean;
  naEmpresa: boolean;
  temSetores: boolean;
  onRenomear: () => void;
  onMover: () => void;
  onSetor: () => void;
  onCompartilhar: () => void;
  onExcluir: () => void;
}) {
  const Icone = pasta.enviados ? FolderInput : pasta.setor ? FolderLock : Folder;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors">
      <Icone size={18} className={pasta.enviados ? "text-brand shrink-0" : "text-fg-muted shrink-0"} aria-hidden />
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={href} className="text-fs-3 font-medium text-fg hover:text-brand transition-colors truncate">
          {pasta.nome}
        </Link>
        {pasta.setor && (
          <Selo tom="atencao">
            <Lock size={10} aria-hidden /> Só {pasta.setor}
          </Selo>
        )}
        {pasta.compartilhada && !pasta.enviados && (
          <Selo tom="marca">
            <Users size={10} aria-hidden /> No portal
          </Selo>
        )}
      </div>
      <span className="text-micro text-fg-muted tabular-nums shrink-0">{rotuloDeItens(pasta.itens)}</span>
      {podeMexer && (
        <MenuDeMaisAcoes rotulo={`Ações da pasta ${pasta.nome}`}>
          {naEmpresa && (
            <ItemDoMenu icone={<Share2 size={14} />} onClick={onCompartilhar}>
              Compartilhar
            </ItemDoMenu>
          )}
          {!pasta.daCasa && (
            <>
              <ItemDoMenu icone={<Pencil size={14} />} onClick={onRenomear}>
                Renomear
              </ItemDoMenu>
              <ItemDoMenu icone={<MoveRight size={14} />} onClick={onMover}>
                Mover
              </ItemDoMenu>
              {temSetores && (
                <ItemDoMenu icone={<FolderLock size={14} />} onClick={onSetor}>
                  Quem vê
                </ItemDoMenu>
              )}
              <ItemDoMenu icone={<Trash2 size={14} />} danger onClick={onExcluir}>
                Mandar para a lixeira
              </ItemDoMenu>
            </>
          )}
        </MenuDeMaisAcoes>
      )}
    </li>
  );
}

function LinhaDoArquivo({
  arquivo,
  podeMexer,
  mostrarCliente,
  onRenomear,
  onMover,
  onExcluir,
}: {
  arquivo: ArquivoNaTela;
  podeMexer: boolean;
  /** A pasta está no portal: vale mostrar se o cliente abriu. */
  mostrarCliente: boolean;
  onRenomear: () => void;
  onMover: () => void;
  onExcluir: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors">
      <IconeDoArquivo nome={arquivo.nome} />
      <div className="min-w-0 flex-1">
        <a
          href={enderecoDoArquivo(arquivo)}
          target={arquivo.previa ? "_blank" : undefined}
          rel="noreferrer"
          className="block text-fs-3 font-medium text-fg hover:text-brand transition-colors truncate"
          title={arquivo.previa ? "Abrir" : "Baixar"}
        >
          {arquivo.nome}
        </a>
        <p className="text-micro text-fg-muted truncate">
          {formatarBytes(arquivo.tamanho)} · {arquivo.peloCliente ? "enviado pelo cliente" : arquivo.enviadoPor ?? "—"} ·{" "}
          {formatInstantDateTime(new Date(arquivo.enviadoEm), QUANDO)}
        </p>
      </div>
      {mostrarCliente && (
        <span
          className="hidden sm:inline text-micro text-fg-muted tabular-nums shrink-0"
          title="Quantas vezes alguém do cliente abriu ou baixou pelo portal"
        >
          {arquivo.acessosDoCliente === 0
            ? "Cliente não abriu"
            : `Cliente abriu ${arquivo.acessosDoCliente}× · ${formatInstantDateTime(new Date(arquivo.ultimoAcessoDoCliente!), QUANDO)}`}
        </span>
      )}
      <MenuDeMaisAcoes rotulo={`Ações do arquivo ${arquivo.nome}`}>
        {arquivo.previa && (
          <ItemDoMenu icone={<Eye size={14} />} href={enderecoDoArquivo(arquivo)}>
            Abrir
          </ItemDoMenu>
        )}
        <ItemDoMenu icone={<Download size={14} />} href={enderecoDoArquivo(arquivo, true)}>
          Baixar
        </ItemDoMenu>
        {podeMexer && (
          <>
            <ItemDoMenu icone={<Pencil size={14} />} onClick={onRenomear}>
              Renomear
            </ItemDoMenu>
            <ItemDoMenu icone={<MoveRight size={14} />} onClick={onMover}>
              Mover
            </ItemDoMenu>
            <ItemDoMenu icone={<Trash2 size={14} />} danger onClick={onExcluir}>
              Mandar para a lixeira
            </ItemDoMenu>
          </>
        )}
      </MenuDeMaisAcoes>
    </li>
  );
}

function ResultadosDaBusca({ busca, base }: { busca: { termo: string; resultados: ResultadoDaBusca[] }; base: string }) {
  if (busca.resultados.length === 0) {
    return (
      <EmptyState
        icon={<Search />}
        title={busca.termo.trim().length < 2 ? "Digite pelo menos 2 letras" : "Nenhum arquivo com esse nome"}
        description="A busca olha o nome dos arquivos em todas as pastas que você vê aqui."
        action={
          <Button href={enderecoDaPasta(base, null)} variant="secondary" size="sm">
            Voltar às pastas
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-fs-3 text-fg-secondary">
          {busca.resultados.length === 1 ? "1 arquivo" : `${busca.resultados.length} arquivos`} com “{busca.termo}”
        </p>
        <Button href={enderecoDaPasta(base, null)} variant="ghost" size="sm">
          Limpar busca
        </Button>
      </div>
      <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
        {busca.resultados.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors">
            <IconeDoArquivo nome={a.nome} />
            <div className="min-w-0 flex-1">
              <a
                href={enderecoDoArquivo(a)}
                target={a.previa ? "_blank" : undefined}
                rel="noreferrer"
                className="block text-fs-3 font-medium text-fg hover:text-brand transition-colors truncate"
              >
                {a.nome}
              </a>
              <Link href={enderecoDaPasta(base, a.pastaId)} className="text-micro text-fg-muted hover:text-brand truncate block">
                {a.pastaRotulo}
              </Link>
            </div>
            <span className="text-micro text-fg-muted tabular-nums shrink-0">{formatarBytes(a.tamanho)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
