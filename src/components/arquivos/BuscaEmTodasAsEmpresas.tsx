"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Download, FolderOpen, SearchX } from "lucide-react";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";
import { Cartao, CartoesNoCelular, InfoDoCartao, TabelaNoDesktop } from "@/components/shared/ListaResponsiva";
import { formatarBytes } from "@/lib/fileSize";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";
import {
  ARQUIVOS_POR_VEZ,
  EMPRESAS_POR_VEZ,
  ESPERA_DA_DIGITACAO_MS,
  MAXIMO_DE_ARQUIVOS,
  MAXIMO_DE_EMPRESAS,
  MINIMO_DO_TERMO,
  PARAMETRO_MAIS_EMPRESAS,
  urlDaBusca,
} from "@/lib/drive/busca";
import { ROTULO_DAS_INTERNAS, enderecoDoAchado, type ArquivoAchado, type EmpresaNaTela } from "@/lib/drive/tela";
import { IconeDoArquivo } from "./IconeDoArquivo";
import { LinhaDaEmpresa } from "./LinhaDaEmpresa";

/**
 * A caixa da busca dos Arquivos, na tela inicial (09/11/2026) — desde
 * 16/11/2026 (melhoria-716) a única da tela: acha empresa e arquivo. Busca
 * sozinha 400 ms depois da última tecla — o Enter não espera — e navega sem
 * recarregar (`NavegacaoSemRecarregar`): a lista de antes fica esmaecida até a
 * nova chegar, e a caixa não perde o foco.
 *
 * Refinar o termo troca a entrada do histórico; entrar na busca e sair dela
 * criam uma, para o voltar do navegador levar de volta ao início dos Arquivos.
 */
export function CampoDaBuscaNosArquivos() {
  const caminho = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const naUrl = params.get("q") ?? "";
  const { ir } = useNavegarSemRecarregar();
  const [termo, setTermo] = useState(naUrl);
  // `enviado` é o termo que a URL tem ou vai ter: o último que esta caixa
  // mandou, ou o que chegou por fora. Quando a URL muda (`queryVista` é a
  // última que a caixa viu), o `q` igual ao mandado é eco da própria
  // digitação e não mexe na caixa — a pessoa pode ter digitado mais enquanto
  // a busca ia ao servidor. O que muda por fora (voltar do navegador, um link,
  // o filtro que saiu na frente da digitação) vale e reescreve a caixa.
  const [enviado, setEnviado] = useState(naUrl);
  const [queryVista, setQueryVista] = useState(query);
  if (query !== queryVista) {
    setQueryVista(query);
    if (naUrl !== enviado) {
      setEnviado(naUrl);
      setTermo(naUrl);
    }
  }

  function enviar(bruto: string) {
    const t = bruto.trim();
    if (t === enviado || (t.length > 0 && t.length < MINIMO_DO_TERMO)) return;
    setEnviado(t);
    ir(urlDaBusca(caminho, query, t), undefined, { substituir: t !== "" && enviado !== "" });
  }

  // A espera recomeça a cada tecla e a cada mudança da URL — assim o envio
  // sai sempre com a query da hora (o tipo escolhido no meio da digitação
  // vai junto) e não repete o que o Enter já mandou.
  useEffect(() => {
    const timer = setTimeout(() => enviar(termo), ESPERA_DA_DIGITACAO_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, enviado, query]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        // Do formulário, e não do estado: no "limpar" o envio vem antes de o
        // estado ser atualizado.
        enviar(String(new FormData(e.currentTarget).get("q") ?? ""));
      }}
    >
      <CampoDeBusca
        id="arquivos-busca-geral"
        name="q"
        compact
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        enviarAoLimpar
        maxLength={120}
        placeholder="Arquivo, empresa ou CNPJ"
        aria-label="Buscar empresa ou arquivo pelo nome da empresa, pelo CNPJ ou pelo nome do arquivo"
      />
    </form>
  );
}

const DATA: Intl.DateTimeFormatOptions = { dateStyle: "short" };
const DATA_E_HORA: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };
const ROTULO_CURTO_DO_VINCULO = { guia: "Guia", certidao: "Certidão" } as const;

/** Abrir no navegador (PDF, imagem) ou baixar — a mesma rota da lista da pasta. */
function enderecoDoArquivo(a: { id: string; previa: boolean }, baixar = false): string {
  return `/api/arquivos/${a.id}${a.previa && !baixar ? "?ver=1" : ""}`;
}

/**
 * O resultado da busca dos Arquivos. Mora no casco da barra de busca, como as
 * listas com `CascoDaTabela`: no computador, barra e resultado são um cartão
 * só, e cada pé é uma faixa dele.
 *
 * Com texto na busca são dois grupos, nesta ordem (16/11/2026, melhoria-716):
 * "Empresas" — as que batem com o texto, no desenho da lista do início, de 8
 * em 8 até 40 — e "Arquivos". Cada grupo tem o seu vazio de uma linha; com os
 * dois vazios, um vazio só. Só com o tipo escolhido (sem texto) não há o que
 * procurar em empresa: vem a lista de arquivos, sem título de grupo.
 *
 * Os arquivos: tabela no computador, cartões no celular, e o pé com o
 * "Mostrar mais" (de 50 em 50, até 200). O nome abre o arquivo (PDF e imagem
 * no navegador; o resto baixa), a empresa e o caminho abrem as pastas. No
 * "⋯", baixar e abrir a pasta.
 */
export function ResultadosDaBuscaNosArquivos({
  empresas,
  itens,
  temMais,
  pagina,
  termo,
  comTipo,
  rotuloDoTipo,
}: {
  /** O grupo "Empresas"; `null` na busca só pelo tipo, que não procura empresa. */
  empresas: { itens: EmpresaNaTela[]; total: number; levas: number } | null;
  itens: ArquivoAchado[];
  temMais: boolean;
  pagina: number;
  termo: string;
  /** Há um tipo escolhido no filtro — muda o título do vazio. */
  comTipo: boolean;
  /** O nome do tipo escolhido, ao lado do título "Arquivos": o filtro vale só para eles. */
  rotuloDoTipo: string | null;
}) {
  if (itens.length === 0 && (!empresas || empresas.itens.length === 0)) {
    return empresas ? (
      <EmptyState
        icon={<SearchX />}
        title={`Nenhuma empresa ou arquivo com “${termo}”`}
        description="A busca olha o nome, o apelido e o CNPJ da empresa e o nome do arquivo."
      />
    ) : (
      <EmptyState icon={<SearchX />} title="Nenhum arquivo deste tipo" />
    );
  }

  return (
    <>
      {empresas && (
        <>
          <TituloDoGrupo>Empresas</TituloDoGrupo>
          {empresas.itens.length === 0 ? (
            <VazioDoGrupo>Nenhuma empresa com “{termo}”.</VazioDoGrupo>
          ) : (
            // No celular o casco não desenha nada: a lista é um cartão próprio,
            // como a do início. No computador ela é uma faixa do cartão.
            <ul
              aria-label="Empresas encontradas"
              className="bg-surface border border-border rounded-lg shadow-xs divide-y divide-border md:bg-transparent md:border-0 md:rounded-none md:shadow-none"
            >
              {empresas.itens.map((e) => (
                <LinhaDaEmpresa key={e.id} empresa={e} noCasco />
              ))}
            </ul>
          )}
          {empresas.total > empresas.itens.length && (
            <p className="mt-3 md:mt-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-fs-2 text-fg-muted">
              {empresas.levas * EMPRESAS_POR_VEZ < MAXIMO_DE_EMPRESAS ? (
                <>
                  <span>
                    Mostrando {empresas.itens.length} de {empresas.total}.
                  </span>
                  <MostrarMais
                    parametro={PARAMETRO_MAIS_EMPRESAS}
                    leva={empresas.levas}
                    quantos={Math.min(EMPRESAS_POR_VEZ, empresas.total - empresas.itens.length)}
                  />
                </>
              ) : (
                <span>
                  Mostrando {empresas.itens.length} de {empresas.total}. Para achar as outras, digite mais do nome ou o CNPJ.
                </span>
              )}
            </p>
          )}
          <TituloDoGrupo comFioEmCima>
            Arquivos
            {rotuloDoTipo && <span className="font-normal text-fg-muted"> · {rotuloDoTipo}</span>}
          </TituloDoGrupo>
          {itens.length === 0 && (
            <VazioDoGrupo>
              Nenhum arquivo com “{termo}”{comTipo ? " neste tipo" : ""}.
            </VazioDoGrupo>
          )}
        </>
      )}
      {itens.length > 0 && <ArquivosAchados itens={itens} temMais={temMais} pagina={pagina} />}
    </>
  );
}

/**
 * O título de um grupo do resultado. No computador é uma faixa do cartão, com
 * o respiro lateral da barra; no celular, um título solto em cima da lista.
 * `comFioEmCima` é do grupo que vem depois de outro: fecha a lista de cima.
 */
function TituloDoGrupo({ children, comFioEmCima = false }: { children: React.ReactNode; comFioEmCima?: boolean }) {
  return (
    <h2
      className={`mt-5 mb-2 min-w-0 break-words text-ui font-semibold text-fg md:m-0 md:px-4 md:py-2.5 md:border-b md:border-border ${
        comFioEmCima ? "md:border-t" : ""
      }`.trim()}
    >
      {children}
    </h2>
  );
}

/** O vazio de um grupo quando o outro achou algo: uma linha, sem ilustração. */
function VazioDoGrupo({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 break-words text-ui text-fg-muted md:px-4 md:py-3">{children}</div>;
}

function ArquivosAchados({ itens, temMais, pagina }: { itens: ArquivoAchado[]; temMais: boolean; pagina: number }) {
  return (
    <>
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[880px] text-ui">
          <colgroup>
            <col />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[112px]" />
            <col className="w-[96px]" />
            <col className="w-[64px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-4 py-2.5 c41-a-esquerda">Arquivo</th>
              <th className="px-4 py-2.5">Empresa</th>
              <th className="px-4 py-2.5">Pasta</th>
              <th className="px-4 py-2.5">Enviado em</th>
              <th className="px-4 py-2.5">Tamanho</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {itens.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 c41-a-esquerda">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <IconeDoArquivo nome={a.nome} />
                    <NomeDoArquivo a={a} className="truncate" />
                    {a.vinculo && (
                      <Selo tom="marca" className="shrink-0">
                        {ROTULO_CURTO_DO_VINCULO[a.vinculo]}
                      </Selo>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <EmpresaDoArquivo a={a} />
                </td>
                <td className="px-4 py-3">
                  {/* Duas linhas antes de cortar: o fim do caminho é a pasta
                      onde o arquivo está, e é ele que se procura. */}
                  <Link
                    href={enderecoDoAchado(a)}
                    data-dica={a.pastaRotulo}
                    className="block line-clamp-2 break-words text-fg-secondary hover:text-brand transition-colors"
                  >
                    {a.pastaRotulo}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-fg-secondary" data-dica={formatInstantDateTime(new Date(a.enviadoEm), DATA_E_HORA)}>
                  {formatInstantDateTime(new Date(a.enviadoEm), DATA)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-fg-secondary">{formatarBytes(a.tamanho)}</td>
                <td className="px-4 py-3">
                  <AcoesDoArquivo a={a} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>

      <CartoesNoCelular>
        {itens.map((a) => (
          <Cartao key={a.id}>
            <div className="flex items-start gap-2.5">
              <IconeDoArquivo nome={a.nome} />
              <div className="min-w-0 flex-1">
                <NomeDoArquivo a={a} className="block break-words" />
                <InfoDoCartao>
                  {a.empresa?.nome ?? ROTULO_DAS_INTERNAS} ·{" "}
                  <Link href={enderecoDoAchado(a)} className="hover:text-brand">
                    {a.pastaRotulo}
                  </Link>
                </InfoDoCartao>
                <InfoDoCartao className="tabular-nums">
                  {formatInstantDateTime(new Date(a.enviadoEm), DATA_E_HORA)} · {formatarBytes(a.tamanho)}
                </InfoDoCartao>
                {a.vinculo && (
                  <Selo tom="marca" className="mt-1.5">
                    {ROTULO_CURTO_DO_VINCULO[a.vinculo]}
                  </Selo>
                )}
              </div>
              <AcoesDoArquivo a={a} grande />
            </div>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {temMais && (
        // `p` filho direto do casco: no computador vira a faixa de baixo do
        // cartão (`.c41-casco > p`, globals.css).
        <p className="mt-3 md:mt-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-fs-2 text-fg-muted">
          {pagina * ARQUIVOS_POR_VEZ < MAXIMO_DE_ARQUIVOS ? (
            <>
              <span>Mostrando os {itens.length} mais recentes.</span>
              <MostrarMais parametro="pagina" leva={pagina} quantos={ARQUIVOS_POR_VEZ} />
            </>
          ) : (
            <span>
              Mostrando os {MAXIMO_DE_ARQUIVOS} mais recentes. Para achar o resto, junte mais uma palavra à busca — o nome da empresa, por
              exemplo — ou escolha um tipo.
            </span>
          )}
        </p>
      )}
    </>
  );
}

function NomeDoArquivo({ a, className }: { a: ArquivoAchado; className: string }) {
  return (
    <a
      href={enderecoDoArquivo(a)}
      target={a.previa ? "_blank" : undefined}
      rel="noreferrer"
      // A dica é o nome inteiro; o que o clique faz vai no nome acessível,
      // como na lista da pasta (auditoria de UX, 30/10/2026).
      data-dica={a.nome}
      aria-label={`${a.previa ? "Abrir" : "Baixar"} ${a.nome}`}
      className={`min-w-0 font-medium text-fg hover:text-brand transition-colors ${className}`}
    >
      {a.nome}
    </a>
  );
}

function EmpresaDoArquivo({ a }: { a: ArquivoAchado }) {
  if (!a.empresa) {
    return (
      <Link href="/arquivos/internas" className="block truncate text-fg-secondary hover:text-brand transition-colors">
        {ROTULO_DAS_INTERNAS}
      </Link>
    );
  }
  return (
    <>
      <Link href={`/arquivos/empresa/${a.empresa.id}`} className="block truncate text-fg hover:text-brand transition-colors">
        {a.empresa.nome}
      </Link>
      {a.empresa.cnpj && <span className="block text-micro text-fg-muted tabular-nums">{formatCnpj(a.empresa.cnpj)}</span>}
    </>
  );
}

function AcoesDoArquivo({ a, grande = false }: { a: ArquivoAchado; grande?: boolean }) {
  return (
    <MenuDeMaisAcoes rotulo={`Ações do arquivo ${a.nome}`} size={grande ? "md" : "sm"}>
      <ItemDoMenu icone={<Download size={14} />} href={enderecoDoArquivo(a, true)} download>
        Baixar
      </ItemDoMenu>
      <ItemDoMenu icone={<FolderOpen size={14} />} href={enderecoDoAchado(a)}>
        Abrir a pasta
      </ItemDoMenu>
    </MenuDeMaisAcoes>
  );
}

/**
 * Mais uma leva na mesma lista (50 arquivos, 8 empresas), sem recarregar e sem
 * rolar: a pessoa continua de onde estava. Troca a entrada do histórico — é a
 * mesma busca, mais longa. `parametro` é o da URL que conta as levas da lista.
 *
 * São dois na tela desde 16/11/2026 (melhoria-716), e a transição é uma só
 * para a tela inteira: "Carregando…" fica só no que foi clicado — o outro
 * espera, desabilitado. O clique guarda a query em que saiu, e não um "estou
 * carregando": a lista troca no lugar, sem remontar este botão, e a marca
 * deixa de valer sozinha quando a URL muda.
 */
function MostrarMais({ parametro, leva, quantos }: { parametro: string; leva: number; quantos: number }) {
  const caminho = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const { ir, pendente } = useNavegarSemRecarregar();
  const [pedidoEm, setPedidoEm] = useState<string | null>(null);
  function irParaAProxima() {
    const q = new URLSearchParams(query);
    q.set(parametro, String(leva + 1));
    setPedidoEm(query);
    ir(`${caminho}?${q.toString()}`, undefined, { substituir: true });
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={irParaAProxima}
      loading={pendente && pedidoEm === query}
      disabled={pendente}
      loadingLabel="Carregando…"
    >
      Mostrar mais {quantos}
    </Button>
  );
}
