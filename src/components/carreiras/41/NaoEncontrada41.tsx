import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import type { RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { Moldura41 } from "./Moldura41";
import { TrianguloDaFaixa } from "./Triangulos";

/**
 * Vaga encerrada (ou endereço errado) no 41 Carreiras: a marca, uma busca e
 * o caminho de volta às vagas abertas — quem chegou por um link antigo do
 * LinkedIn ou do WhatsApp não fica sem saída.
 */
export function NaoEncontrada41({ rotas }: { rotas: RotasDoPortal }) {
  return (
    <Moldura41 rotas={rotas}>
      <section className="t41-faixa" aria-labelledby="nao-encontrada-titulo" style={{ minHeight: "calc(100vh - 64px - 260px)" }}>
        <TrianguloDaFaixa />
        <div className="t41-caixa t41-faixa__conteudo" style={{ paddingTop: 56, paddingBottom: 72 }}>
          <div style={{ maxWidth: 720 }}>
          <p className="t41-selo t41-selo--lilas">Vaga não encontrada</p>
          <h1 id="nao-encontrada-titulo" className="t41-faixa__titulo">
            Esta vaga <strong>não está mais aberta</strong>
          </h1>
          <p className="t41-faixa__texto">
            Ela pode ter sido encerrada, ou o endereço está incompleto. Busque outra vaga ou veja todas as que estão abertas agora.
          </p>
          <form method="get" action={rotas.vagas} role="search" aria-label="Buscar vagas" className="t41-busca-compacta t41-busca-compacta--uma">
            <div className="t41-busca__campo">
              <label htmlFor="nao-encontrada-q" className="t41-busca__rotulo">
                <Search size={13} aria-hidden="true" /> Cargo ou palavra-chave
              </label>
              <Input id="nao-encontrada-q" name="q" type="search" placeholder="Ex.: analista fiscal" maxLength={80} className="t41-campo-nu" autoComplete="off" />
            </div>
            <button type="submit" className="t41-botao t41-botao--primario">
              <Search size={18} aria-hidden="true" /> Buscar
            </button>
          </form>
          <div style={{ marginTop: 20 }}>
            <Link href={rotas.vagas} className="t41-botao t41-botao--lilas">
              Ver vagas abertas <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          </div>
        </div>
      </section>
    </Moldura41>
  );
}
