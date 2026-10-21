# Ceci no portal: o piloto com os primeiros clientes

Roteiro de 21/10/2026 para ligar a Ceci no portal de 2 ou 3 clientes do BPO. O código entrou nos PRs #254, #255, #259 e #261. Ela já está no código e vem **desligada**: só aparece para o cliente depois dos passos abaixo.

## 1. Antes de ligar

1. **Publicar com a atualização do banco.** Rode `npx prisma migrate deploy` antes do deploy. A migration `20261021180000_ceci_no_portal` cria a coluna `companies.ceciNoPortal`, que começa desligada. Sem ela, a aba da Ceci avisa que falta atualizar o banco, e o portal funciona normalmente, sem a Ceci.
2. **Chave de IA do escritório.** Em **Configurações › Inteligência artificial**, confira se a chave do escritório está cadastrada. Sem chave, a Ceci não aparece.
3. **Ligar o agente.** Ainda em **Inteligência artificial**, ligue o agente **"Ceci · Portal do cliente (chat)"**. Ele nasce desligado.
   - O teto do mês vem de fábrica em **R$ 50,00** e **5.000 perguntas**. Pela estimativa de 13/10, de cerca de 1 centavo por pergunta, isso sobra para o piloto.
   - Quando o teto é atingido, a Ceci continua visível, mas responde que o limite do mês acabou.

## 2. Escolher os clientes

O ideal é um cliente que:
- **já entra no portal**, para que o retorno venha de uso de verdade;
- **tem movimento no Connect**, com contas, pendências ou processos, para a Ceci ter o que responder;
- **é de uma empresa já tirada do Omie, ou que sai logo.** Nas empresas ainda lidas do Omie, as contas também aparecem, mas o retrato muda a cada leitura.

Esta consulta, só de leitura, lista os acessos ativos com a última entrada no portal e o que cada empresa tem em aberto. Ela ajuda a escolher:

```sql
SELECT c.id AS empresa_id,
       COALESCE(c.displayName, c.tradeName, c.name) AS empresa,
       pu.name AS acesso, pu.email, pu.lastLoginAt,
       (SELECT COUNT(*) FROM finance_entries fe
         WHERE fe.companyId = c.id AND fe.status NOT IN ('CANCELADO', 'PAGO')) AS contas_em_aberto
  FROM portal_users pu
  JOIN portal_user_companies puc ON puc.portalUserId = pu.id
  JOIN companies c ON c.id = puc.companyId
 WHERE pu.active = true
 ORDER BY pu.lastLoginAt IS NULL, pu.lastLoginAt DESC
 LIMIT 30;
```

## 3. Ligar por empresa

Em **Administração › Portal do cliente › Ceci**, ligue as empresas escolhidas.
- Ligada na matriz, a Ceci vale também para as filiais que o acesso vê por ela.
- Um acesso com uma empresa no piloto e outra fora só ouve da Ceci sobre a do piloto.
- A tela mostra quantas empresas estão ligadas e o gasto do mês contra o teto.

## 4. Conferir com o cliente

1. Entre no portal com o acesso de um dos clientes do piloto. O botão da Ceci aparece no canto, e o passo a passo dela está em **Ajuda**.
2. Faça três perguntas que o cliente faria:
   - "O que tenho para pagar esta semana?"
   - "Tem alguma pendência minha?"
   - "Em que pé está o meu processo?"
3. Peça algo que precisa da equipe, como "preciso da segunda via de um boleto". A Ceci deve montar uma solicitação preenchida, e **nada é enviado** até o cliente revisar e clicar.
4. Com um acesso de outro cliente, sem empresa ligada, a Ceci não deve aparecer.

## 5. Acompanhar

- **Gasto e número de perguntas:** na aba da Ceci, em Portal do cliente, e em Inteligência artificial.
- **Limite por acesso:** 20 perguntas por dia. Passou disso, a Ceci pede para continuar no dia seguinte.
- **Para desligar:** desligue a empresa na aba da Ceci, ou o agente inteiro em Inteligência artificial. Vale na hora, sem publicar nada.
