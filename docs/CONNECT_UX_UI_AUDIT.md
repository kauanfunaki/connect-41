# Auditoria e Padronização de UX/UI — Módulo Empresas

> Data: 20/07/2026 · Escopo: módulo Empresas (cadastro, edição e os
> sub-recursos por empresa: cargos, departamentos, benefícios, turnos, folha,
> documentos internos e Documentos para Cliente).

## 1. Resumo executivo

O código real do módulo Empresas foi lido por completo (17 páginas, 6
formulários, 3 componentes compartilhados) antes de qualquer alteração. O
diagnóstico confirmou, com evidência de código, os sintomas relatados:
container, breadcrumb e tipografia divergiam entre grupos de páginas do mesmo
módulo, o Stepper de Empresa vazava horizontalmente em containers estreitos,
e cinco listagens tinham estado vazio sem ação. As correções aplicadas nesta
rodada são classificadas **seguras** (só estrutura/visual, sem mudança de
contrato, banco ou regra de negócio) e foram feitas por componente
compartilhado, não página a página. Nenhuma migration foi necessária.

## 2. Telas analisadas

`/empresas`, `/empresas/nova`, `/empresas/[id]`, `/empresas/[id]/editar`,
`/empresas/[id]/{cargos,departamentos,beneficios,turnos,documentos-cliente,folha}`
(listagem + novo + editar de cada um, exceto folha que abre inline). Também
lidos: `Stepper`, `PageContainer`, `PageHeader`, `EmptyState`, `Button`,
`FormShell`, e os 6 componentes de formulário (`EmpresaForm`, `CargoForm`,
`DepartmentForm`, `BenefitCatalogForm`, `WorkShiftForm`,
`ClientDocumentForm`).

## 3. Inconsistências encontradas (com causa raiz)

| # | Sintoma relatado | Causa raiz no código |
|---|---|---|
| 1 | Breadcrumb/título fora do eixo em turno/benefício/departamento/cargo/documento | Essas 5 páginas de listagem usavam `<PageContainer>` (largura "wide", 1440px — igual a `/empresas`), mas as 10 páginas "novo"/"editar" correspondentes usavam `<PageContainer variant="narrow">` (1000px, **centralizado**) para a página inteira — breadcrumb incluído. Resultado: o mesmo breadcrumb ("Empresas / Empresa X / Turnos") aparecia em posições horizontais diferentes dependendo de estar na listagem ou no formulário. |
| 2 | Editar Empresa com dimensão diferente de Nova Empresa | `nova/page.tsx` usava `PageContainer` sem nenhum limite de largura no formulário (form esticava até 1440px). `[id]/editar/page.tsx` usava `PageContainer` + um `<div className="max-w-[1000px] mx-auto">` extra envolvendo breadcrumb+título+formulário juntos — um terceiro padrão de largura, diferente dos dois anteriores. |
| 3 | Stepper com overflow horizontal, última etapa cortada | O Stepper (`Stepper.tsx`) usava `overflow-x-auto` numa única linha. Com 6 etapas e o container estreitado (causa #2), a largura de conteúdo do Stepper (~1200px) excedia a área visível — a rolagem existia, mas sem indicação visual, lida como "corte". |
| 4 | Estados vazios sem ação | 6 listagens (turnos, benefícios, departamentos, cargos, documentos-cliente, folha) chamavam `<EmptyState title="..." />` sem `icon`, `description` nem `action`, embora o componente já suportasse os três. |
| 5 | Botões de formulário com ordem/alinhamento divergente | `EmpresaForm` já usava `[Cancelar][Avançar/Salvar]` alinhado à direita. Os 5 formulários simples (turno, cargo, benefício, departamento, documento-cliente) reimplementavam o rodapé à mão, em **ordem invertida** (`[Salvar][Cancelar]`) e **sem alinhamento à direita** (`flex` sem `justify-end`). `ClientDocumentForm` nem tinha botão Cancelar. |
| 6 | Título de página com hierarquia diferente | Empresas/Empresa usa o token `--fs-display` (~28px). As 12 páginas de sub-recurso usavam `text-[16px]` fixo — mesmo peso visual de um título de card, não de página. |

## 4. Viabilidade por grupo de melhoria

| Grupo | Classificação | Decisão |
|---|---|---|
| Consolidar `PageContainer`/`PageHeader`/breadcrumb | **Segura** | Implementado — componentes já existiam, só não eram usados de forma consistente. |
| Corrigir overflow do Stepper | **Segura** | Implementado — mudança isolada em `Stepper.tsx`, mesma API, mesmo visual de cores/círculos. |
| Padronizar rodapé de formulário (`FormFooter`) | **Segura** | Implementado. |
| Melhorar 6 estados vazios | **Segura** | Implementado. |
| Autocomplete/tags em Cargo, CBO, duplicar cargo | Moderada | **Não implementado nesta rodada** — muda o formato do dado (`area` texto livre → seleção; requisitos texto → lista) e pede confirmação de schema. |
| Validação de faixa salarial (mín ≤ intermediária ≤ máx) | Moderada (lógica de servidor) | **Não implementada** — é mudança de contrato da Server Action `criarCargo`/`atualizarCargo`, fica para a próxima fase com testes dedicados. |
| Campos novos de Turno (dias da semana, intervalo, tolerância, atravessa meia-noite) | Alta (schema) | **Não implementada**, conforme instrução explícita de não adicionar campo de banco fora do escopo imediato. |
| Campos novos de Benefício (valor, periodicidade, coparticipação) | Alta (schema) | **Não implementada** — precisa de migration e justificativa própria. |
| Month picker de competência de folha | Moderada | **Não implementada** — a tela já usa `AbrirCompetenciaForm`, não lida nesta rodada; fica para Fase 3. |
| Dropzone de upload (documentos internos) | Moderada/Alta (segurança) | **Não implementada** — mexe em validação de MIME/tamanho no servidor, fora do escopo desta rodada de layout. |
| Documento para Cliente: estados, e-mail HTML, página pública | **Alta** | **Não implementada** — a própria instrução pede parar antes de mudanças de alto risco. Precisa de levantamento à parte (schema de estados, template de e-mail compatível com Outlook, revisão de segurança do link público). |
| CNPJ duplicado / constraint única | **Alta** (schema + dados) | **Não implementada** — exige antes um relatório de registros conflitantes existentes, que não foi rodado nesta sessão. |
| Drawers para cadastros simples | Moderada | **Não implementada** — troca de padrão de navegação (página → drawer) para 5 fluxos; decisão de produto que vale validar antes de migrar todos de uma vez. |

## 5. Componentes criados

- **`src/components/shared/Breadcrumb.tsx`** — trilha de navegação genérica (`items: {label, href?, truncate?}[]`). Substituiu ~12 blocos de JSX idênticos.
- **`src/components/ui/FormFooter.tsx`** — rodapé padrão `[Cancelar][Salvar]`, alinhado à direita, usando o `Button` já existente (estado de loading incluso).

## 6. Componentes reutilizados (não duplicados)

`PageContainer`, `PageHeader`, `EmptyState`, `Button`, `Stepper` (só corrigido, não recriado) — todos já existiam e cobriam o que a auditoria original pedia (`FormCard`≈`FormShell` já existe; não criei um novo).

## 7. Arquivos alterados

**Componentes compartilhados**: `Stepper.tsx` (fix + a11y).
**Novos**: `Breadcrumb.tsx`, `FormFooter.tsx`.
**Formulários** (rodapé padronizado): `WorkShiftForm.tsx`, `CargoForm.tsx`, `BenefitCatalogForm.tsx`, `DepartmentForm.tsx`, `ClientDocumentForm.tsx` (ganhou prop `cancelHref`, antes inexistente).
**Páginas** (breadcrumb + PageHeader + largura consistente): `empresas/nova`, `empresas/[id]/editar`, e listagem+novo+editar de `turnos`, `beneficios`, `departamentos`, `cargos`, `documentos-cliente`, além da listagem de `folha`. Total: 17 páginas.

## 8. Mudanças de banco

**Nenhuma.** Todas as alterações desta rodada são visuais/estruturais no client e no JSX das páginas — nenhuma Server Action, schema Prisma, rota de API ou contrato de dado foi tocado.

## 9. Decisões técnicas

- **Larguras internas padronizadas**: formulários simples (turno/benefício/departamento/cargo) = `max-w-[720px]`; Documento para Cliente (tem editor rich text + upload) = `max-w-[860px]`; Empresa (multi-step, mais campos) = `max-w-[900px]`. Todas dentro do `PageContainer` "wide" padrão (1440px), igual às páginas de listagem — resolve a inconsistência #1/#2 sem inventar um quarto padrão de container.
- **Stepper**: troquei `overflow-x-auto` (rolagem forçada numa linha) por `flex-wrap` (quebra pra 2 linhas em telas estreitas). Nenhuma prop mudou — qualquer wizard futuro que use este componente herda o fix.
- **Não usei "PageContainer narrow" pros sub-recursos** porque isso reproduziria o mesmo problema (container inteiro estreitado) só que de forma consistente entre si — a página de listagem desses recursos já usa "wide", então "narrow" continuaria divergente do padrão real do módulo.
- **A11y no Stepper**: adicionei `role="tablist"/"tab"`, `aria-current="step"`, `aria-invalid` no passo com erro, e `aria-label` com o status por extenso — sem alterar a interação por teclado (os passos já eram `<button>` nativos, focáveis e ativáveis via Enter/Espaço).

## 10. Melhorias aplicadas (lista fechada)

1. Breadcrumb consolidado em componente único, aplicado às 17 páginas do módulo.
2. `PageHeader` (já existente) substituindo blocos de título/subtítulo/ação duplicados.
3. Container e largura de formulário padronizados entre Nova/Editar Empresa e os 5 sub-recursos.
4. Stepper sem overflow forçado; quebra de linha responsiva; melhorias de acessibilidade.
5. Rodapé de formulário padronizado (`[Cancelar][Salvar]`, direita) em 5 formulários — `ClientDocumentForm` ganhou botão Cancelar que não existia.
6. 6 estados vazios (turnos, benefícios, departamentos, cargos, documentos-cliente, folha) com ícone, descrição e ação — a ação do estado vazio é a mesma do botão do cabeçalho.

## 11. Melhorias deixadas para próxima fase (requer confirmação antes de iniciar)

- **Fase 3 — Cargos**: autocomplete/seleção de departamento para "Área", requisitos como lista/tags, validação de faixa salarial (mín ≤ intermediária ≤ máx), duplicar cargo. Requer decisão de schema (Área vira relação com `Department`?).
- **Fase 3 — Turnos**: dias da semana, intervalo, tolerância, turno que atravessa meia-noite. Requer migration (novos campos em `WorkShift`).
- **Fase 3 — Benefícios**: valor, periodicidade, coparticipação, campo "Outro" nomeado. Requer migration em `BenefitCatalog`.
- **Fase 3 — Folha**: month picker acessível substituindo os inputs numéricos de mês/ano; impedir duplicidade de competência; listar status/data de criação.
- **Fase 4 — Documentos internos**: dropzone com drag-and-drop, progresso, validação de MIME real (não só extensão) no servidor.
- **Fase 5 — Documento para Cliente completo**: clareza de estados (o modelo real precisa ser lido a fundo antes — não presumir estados como "revogado"/"expirado" sem confirmar no schema), template de e-mail HTML compatível com Outlook, página pública redesenhada, histórico de envio/reenvio.
- **Fase 6 — Listagem de Empresas**: menu contextual de ações, relatório de CNPJ inválido/duplicado antes de qualquer constraint de banco.
- **Fase 7 — Drawers**: avaliar substituir página completa por drawer lateral em departamento/benefício/turno (cadastros de poucos campos) — decisão de produto, não só técnica.

## 12. Riscos identificados

- Nenhum risco de regressão funcional identificado nas mudanças aplicadas — são estruturais/visuais, mesmas Server Actions, mesmos nomes de campo de formulário.
- Risco de **percepção**: quem já usa o Stepper "cortado" como referência de "cheguei no fim" pode notar a nova quebra em 2 linhas como diferente — é a correção intencional do bug relatado.
- `ClientDocumentForm` ganhou um prop obrigatório novo (`cancelHref`) — os dois únicos callers (`novo`, `editar`) já foram atualizados; se existir algum outro caller fora do módulo Empresas (não encontrado na busca), o build acusaria erro de tipo — o build rodou limpo.

## 13. Migrations

Nenhuma.

## 14. Rollback

Todas as mudanças estão isoladas em arquivos de UI (componentes React/Next.js) sem estado persistido novo. Rollback = reverter o commit desta rodada via Git; não há dado em banco para desfazer.

## 15. Testes executados

- `npx tsc --noEmit` — sem erros.
- `npx eslint src --max-warnings 0` — sem erros/avisos.
- `npx vitest run` — 5 arquivos, 24 testes, todos passando (suite existente; nenhum teste novo foi necessário porque nenhuma regra de negócio/validação foi alterada nesta rodada).
- `npm run build` — build de produção completo, todas as 18 rotas do módulo Empresas compiladas sem erro.

## 16. Smoke tests realizados

Não foi possível abrir o app no navegador autenticado nesta sessão (login exige senha, que não é inserida por política). A verificação desta rodada ficou restrita a `tsc`/`eslint`/`vitest`/`build`. **Recomendo conferência visual manual** nas páginas alteradas antes de considerar a fase encerrada — em especial `/empresas/[id]/editar` (o bug do Stepper) em 1366×768 e 1920×1080.

## 17. Pendências objetivas

1. Conferência visual manual (ver seção 16).
2. Decidir, com o time, quais itens da seção 11 entram como próxima fase e em que ordem.
3. Para CNPJ duplicado (seção 4): rodar um relatório read-only dos registros existentes antes de propor qualquer constraint.
4. Para Documento para Cliente (seção 11): sessão de levantamento dedicada — schema de estados, e-mail, página pública e auditoria são todos "alto risco" e não devem ser feitos como parte de um ajuste de layout.
