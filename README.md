This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Chamados internos

O módulo `helpdesk` oferece atendimento interno por setor, formulários por categoria, fila, SLA, aprovações, anexos e triagem conversacional opcional com OpenAI. Nasce desligado e usa os controles de módulo, assinatura e IA por escritório já existentes no Connect.

Configuração, migração, operação, limites e testes isolados: [guia do helpdesk](docs/HELPDESK.md). Verificações específicas: `npm run test:helpdesk`, `npm run test:helpdesk:db` e `npm run test:helpdesk:ui`; os dois últimos exigem um banco descartável local explícito.

## Ops Center

O módulo Ops Center do Tech acompanha automações, donos, atividade e resultados. Inclui o filtro Minhas automações e avisa o dono no Connect ao receber um erro. Nasce desligado por escritório. Ativação, contrato dos bots e validação: [guia do Ops Center](docs/OPS-CENTER.md).

## GitHub — Contribuições

Heatmaps de commits, pull requests, issues e revisões nos repositórios selecionados em **Integrações → GitHub**. O módulo é exclusivo do Tech, nasce desligado e usa OAuth, credenciais cifradas por escritório e sincronização em lotes com retomada.

O servidor de produção inicia a coleta automática junto do Next: fechar a página não interrompe a fila. O painel mostra o andamento e carrega os calendários conforme a rolagem. Não exige nova migration para essas melhorias; `GITHUB_SYNC_ENABLED=false` reserva a execução para um cron externo.

Configuração, ativação, regras de contagem e testes isolados: [guia do GitHub](docs/GITHUB-CONTRIBUTIONS.md). Verificações: `npm run test:github`, `npm run test:github:db` e `npm run test:github:ui`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
