"use client";

// O leitor de rubricas eSocial x sistema (12/11/2026, fase 3e): a conferência
// de cada rubrica do Connect e, com os XML do S-1010 que já estão no eSocial,
// a comparação das duas tabelas. O XML é lido no navegador e não é enviado.

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { Secao, TD, TH, TR } from "@/components/dp2/Secao";
import type { RubricaEsocial } from "@/lib/dp2/esocial/eventos";
import { compararComEsocial, conferirRubrica, lerS1010, type Divergencia, type RubricaDoEsocial } from "@/lib/dp2/esocial/leitorDeRubricas";

type Props = { rubricas: (RubricaEsocial & { id: string })[] };

function TabelaDeDivergencias({ itens, idDe }: { itens: Divergencia[]; idDe: Map<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-fs-3">
        <thead>
          <tr>
            <th className={TH}>Rubrica</th>
            <th className={TH}>Campo</th>
            <th className={TH}>O que está diferente</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {itens.map((d, i) => (
            <tr key={`${d.codigo}-${d.campo}-${i}`} className={TR}>
              <td className={TD}>
                {idDe.has(d.codigo) ? (
                  <Link href={`/dp2/rubricas?rubrica=${idDe.get(d.codigo)}`} scroll={false} className="text-brand hover:underline">
                    {d.codigo} · {d.nome}
                  </Link>
                ) : (
                  `${d.codigo} · ${d.nome}`
                )}
              </td>
              <td className={TD}>{d.campo}</td>
              <td className={TD}>{d.texto}</td>
              <td className={`${TD} text-right`}>
                <Selo tom={d.gravidade === "erro" ? "perigo" : "atencao"}>{d.gravidade === "erro" ? "Corrigir" : "Conferir"}</Selo>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeitorDeRubricas({ rubricas }: Props) {
  const idDe = useMemo(() => new Map(rubricas.map((r) => [r.codigo, r.id])), [rubricas]);
  const internas = useMemo(() => rubricas.flatMap(conferirRubrica), [rubricas]);
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);
  const [doEsocial, setDoEsocial] = useState<RubricaDoEsocial[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const comparacao = useMemo(() => (doEsocial ? compararComEsocial(rubricas, doEsocial) : null), [rubricas, doEsocial]);

  async function ler(files: File[]) {
    // "pendente": o arquivo é só lido aqui, não sobe para o servidor.
    const novos = files.map((file) => ({ id: crypto.randomUUID(), file, progresso: 0, estado: "pendente" as const }));
    const todos = [...fila, ...novos];
    setFila(todos);
    const textos = await Promise.all(todos.map((a) => a.file.text()));
    const lidas = lerS1010(textos.join("\n"));
    setErro(lidas.length === 0 ? "Nenhuma rubrica (S-1010) encontrada nos arquivos." : null);
    setDoEsocial(lidas.length ? lidas : null);
  }

  return (
    <div className="flex flex-col gap-5">
      <Secao
        titulo="Conferência das rubricas"
        apoio="Cada rubrica do Connect contra o que vai no eSocial: natureza, tipo e os códigos de incidência de INSS, IRRF e FGTS."
      >
        {internas.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">Nenhuma divergência: as {rubricas.length} rubricas batem com o eSocial.</p>
        ) : (
          <TabelaDeDivergencias itens={internas} idDe={idDe} />
        )}
      </Secao>

      <Secao
        titulo="Comparar com o eSocial"
        apoio="Solte os XML do S-1010 da empresa (baixados do portal do eSocial ou exportados da Domínio) para comparar a tabela que já está no governo com a do Connect. Os arquivos são lidos aqui, no navegador."
        acao={
          doEsocial ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFila([]);
                setDoEsocial(null);
              }}
            >
              Limpar
            </Button>
          ) : undefined
        }
      >
        <FileDropzone accept=".xml" maxSizeMb={20} multiple arquivos={fila} onAdicionar={ler} onRemover={(id) => setFila((prev) => prev.filter((a) => a.id !== id))} />
        {erro && (
          <p className="text-fs-3 text-danger mt-3" role="alert">
            {erro}
          </p>
        )}
        {comparacao && (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-fs-3 text-fg">
              {doEsocial!.length} rubricas no eSocial: {comparacao.iguais} iguais, {new Set(comparacao.divergencias.map((d) => d.codigo)).size} com diferença,{" "}
              {comparacao.soNoEsocial.length} só no eSocial e {comparacao.soNoSistema.length} só no Connect.
            </p>
            {comparacao.outrasTabelas.length > 0 && (
              <p className="text-fs-2 text-fg-muted">
                No eSocial a tabela de rubricas é {comparacao.outrasTabelas.join(", ")}; o Connect envia como DP2. Enquanto for assim, as rubricas do Connect entram como uma tabela nova, e a comparação é feita
                pelo código.
              </p>
            )}
            {comparacao.divergencias.length > 0 && <TabelaDeDivergencias itens={comparacao.divergencias} idDe={idDe} />}
            {comparacao.soNoEsocial.length > 0 && (
              <div>
                <h3 className="text-fs-3 font-semibold text-fg mb-2">Só no eSocial</h3>
                <p className="text-fs-2 text-fg-muted mb-2">Rubricas que a empresa usa e o Connect não tem: crie como rubrica livre com o mesmo código, se ainda forem usadas.</p>
                <ul className="text-fs-3 text-fg grid gap-1 sm:grid-cols-2">
                  {comparacao.soNoEsocial.map((r) => (
                    <li key={`${r.tabela}-${r.codigo}`}>
                      {r.codigo} · {r.nome} {r.natureza ? <span className="text-fg-muted">(natureza {r.natureza})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {comparacao.soNoSistema.length > 0 && (
              <p className="text-fs-2 text-fg-muted">
                Só no Connect: {comparacao.soNoSistema.map((r) => `${r.codigo} · ${r.nome}`).join("; ")}. Vão para o eSocial no próximo S-1010.
              </p>
            )}
          </div>
        )}
      </Secao>
    </div>
  );
}
