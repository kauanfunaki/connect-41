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
import { ARQUIVOS_POR_VEZ, ESPERA_DA_DIGITACAO_MS, MAXIMO_DE_ARQUIVOS, MINIMO_DO_TERMO, urlDaBusca } from "@/lib/drive/busca";
import { ROTULO_DAS_INTERNAS, enderecoDoAchado, type ArquivoAchado } from "@/lib/drive/tela";
import { IconeDoArquivo } from "./IconeDoArquivo";

/**
 * A caixa da busca em todas as empresas, na tela inicial dos Arquivos
 * (09/11/2026). Busca sozinha 400 ms depois da última tecla — o Enter não
 * espera — e navega sem recarregar (`NavegacaoSemRecarregar`): a lista de
 * antes fica esmaecida até a nova chegar, e a caixa não perde o foco.
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
        aria-label="Buscar arquivo em todas as empresas pelo nome do arquivo, pelo nome da empresa ou pelo CNPJ"
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
 * O resultado da busca em todas as empresas: tabela no computador, cartões no
 * celular, e o pé com o "Mostrar mais" (de 50 em 50, até 200). Mora no casco
 * da barra de busca, como as listas com `CascoDaTabela`: no computador, barra
 * e lista são um cartão só, e o pé é a faixa de baixo dele.
 *
 * O nome abre o arquivo (PDF e imagem no navegador; o resto baixa), a
 * empresa e o caminho abrem as pastas. No "⋯", baixar e abrir a pasta.
 */
export function ResultadosDaBuscaNosArquivos({
  itens,
  temMais,
  pagina,
  termo,
  comTipo,
}: {
  itens: ArquivoAchado[];
  temMais: boolean;
  pagina: number;
  termo: string;
  /** Há um tipo escolhido no filtro — muda o título do vazio. */
  comTipo: boolean;
}) {
  if (itens.length === 0) {
    return (
      <EmptyState
        icon={<SearchX />}
        title={termo ? `Nenhum arquivo com “${termo}”${comTipo ? " neste tipo" : ""}` : "Nenhum arquivo deste tipo"}
        description="A busca olha o nome do arquivo e o nome, o apelido ou o CNPJ da empresa — inteiro ou só a raiz, com ou sem pontos —, em todas as pastas que você vê."
      />
    );
  }

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
              <MostrarMais pagina={pagina} />
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
 * Mais 50 na mesma lista, sem recarregar e sem rolar: a pessoa continua de
 * onde estava. Troca a entrada do histórico — é a mesma busca, mais longa.
 */
function MostrarMais({ pagina }: { pagina: number }) {
  const caminho = usePathname();
  const params = useSearchParams();
  const { ir, pendente } = useNavegarSemRecarregar();
  function irParaAProxima() {
    const q = new URLSearchParams(params.toString());
    q.set("pagina", String(pagina + 1));
    ir(`${caminho}?${q.toString()}`, undefined, { substituir: true });
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={irParaAProxima} loading={pendente} loadingLabel="Carregando…">
      Mostrar mais {ARQUIVOS_POR_VEZ}
    </Button>
  );
}
