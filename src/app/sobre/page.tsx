import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

// A página pública do Connect — sem sessão (06/10/2026).
//
// Existe por causa da verificação do app no Google (o "Entrar com o Google" do
// portal): o Google confere uma página inicial no domínio verificado, que diga
// o que o app faz e aponte a política de privacidade, e ela não pode estar
// atrás de login — a raiz do Connect leva direto ao /login. Quando o Connect
// mudar para app.useconnect.com.br e o site de apresentação ocupar o endereço
// principal, este texto vai para o site.
//
// O texto descreve o que o Connect faz hoje. Mudou o produto, muda aqui.

export const metadata: Metadata = {
  title: "Connect · plataforma do escritório de contabilidade",
  description:
    "O Connect é a plataforma em que o escritório de contabilidade organiza o trabalho da equipe e atende os clientes pelo Portal do Cliente.",
};

const CONTATO = "marcos@41contabil.com.br";

const PARA_A_EQUIPE = [
  "Processos societários com etapas, exigências e prazos em dias úteis",
  "Financeiro dos clientes: contas a pagar e a receber, conciliação bancária e DRE",
  "Documentos fiscais das empresas atendidas",
  "Departamento pessoal e recrutamento",
  "Agenda, tarefas e o Meu dia, com a opção de conectar o Google Agenda para marcar reuniões",
];

const PARA_O_CLIENTE = [
  "Documentos fiscais das suas empresas",
  "Pendências e pedidos do escritório, respondidos com o arquivo junto",
  "Aprovação de pagamentos",
  "Financeiro: contas, fluxo de caixa e DRE",
  "Solicitações ao escritório e comunicados",
  "Andamento dos processos da sua empresa",
];

function Bloco({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-[var(--c41-shadow-xs)]">
      <h2 className="text-[16px] font-semibold text-fg">{titulo}</h2>
      <ul className="list-disc pl-5 flex flex-col gap-1.5 text-[14px] leading-relaxed text-fg">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function SobreOConnectPage() {
  return (
    <main className="min-h-screen px-4 py-10">
      <article className="mx-auto w-full max-w-[880px] flex flex-col gap-8">
        <header className="flex flex-col gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-light.svg" alt="Connect" className="block dark:hidden h-9 w-auto self-start" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className="hidden dark:block h-9 w-auto self-start" />
          <div className="flex flex-col gap-2">
            <h1 className="text-[length:var(--fs-title)] font-bold text-fg">Connect</h1>
            <p className="max-w-[60ch] text-[16px] leading-relaxed text-fg-secondary">
              A plataforma em que o escritório de contabilidade organiza o trabalho da equipe e atende os clientes. A
              equipe trabalha no Connect; o cliente acompanha tudo pelo Portal do Cliente, no computador ou no celular.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/portal/login">Portal do Cliente</Button>
            <Button href="/login" variant="secondary">
              Entrar como equipe
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Bloco titulo="Para a equipe do escritório" itens={PARA_A_EQUIPE} />
          <Bloco titulo="Para o cliente, no Portal do Cliente" itens={PARA_O_CLIENTE} />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold text-fg">Entrar com o Google</h2>
          <p className="max-w-[72ch] text-[14px] leading-relaxed text-fg">
            No Portal do Cliente, é possível entrar com a conta Google. Usamos apenas o e-mail e o nome que o Google
            confirma, para encontrar o acesso que o escritório criou para você. Não guardamos nada da sua conta Google e
            não criamos conta sozinhos. Os detalhes estão na{" "}
            <Link href="/portal/privacidade" className="text-brand hover:underline">
              política de privacidade
            </Link>
            .
          </p>
        </section>

        <footer className="flex flex-col gap-1 border-t border-border pt-4 text-[13px] text-fg-muted">
          <p>
            O Connect é desenvolvido e operado pela 41 TEC LTDA (CNPJ 64.620.403/0001-16), Rua Anne Frank, 2210,
            Boqueirão, Curitiba/PR.
          </p>
          <p>
            <Link href="/portal/privacidade" className="text-brand hover:underline">
              Política de privacidade
            </Link>{" "}
            · Contato:{" "}
            <a href={`mailto:${CONTATO}`} className="text-brand hover:underline">
              {CONTATO}
            </a>
          </p>
        </footer>
      </article>
    </main>
  );
}
