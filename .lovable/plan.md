## Objetivo

Transformar o HTML estático "Vendas x Design — R2 Flexo" em uma aplicação web hospedada onde **todos os dispositivos (PC, celular, tablet) veem os mesmos dados em tempo real**, mantendo fielmente o design atual (amarelo #FFE815, preto #252425, fontes Inter + Fraunces, layout dos cards).

## Backend (Lovable Cloud)

Ativo o Lovable Cloud, que provisiona automaticamente: PostgreSQL, autenticação, storage de arquivos e hospedagem. Sem configuração manual.

**Tabelas:**
- `profiles` — nome, papel (gestor / vendedora / designer), ativo, vinculado ao usuário autenticado
- `user_roles` — papéis em tabela separada (segurança)
- `pedidos` — cliente, matéria-prima, largura matéria, largura/altura etiqueta, formato, cores, especificação, briefing, link referência, status, vendedor, designer, timestamps
- `pedido_anexos` — PDFs da faca e artes/revisões (storage)
- `pedido_historico` — timeline de mudanças de status com data/autor

**Storage:** bucket `anexos` para PDFs e artes.

**Segurança (RLS):**
- Vendedoras: veem/editam só os próprios pedidos
- Designers: veem todos, editam status/arte
- Gestores: acesso total + gestão de usuários

## Autenticação

Login por **email + senha** (substituindo o login local atual). Gestor cadastra novos usuários na tela "Usuários" e define o papel.

## Frontend (React + TanStack Start)

Recriação fiel do design em componentes:
- **Login** — card centralizado, fonte Fraunces no título
- **Header** com logo R2 (SVG inline), nome do usuário, botão Sair
- **Tabs**: Pedidos / + Nova / Usuários (visibilidade por papel)
- **Painel de pedidos** — stats (3 cards), filtros por status, lista com badges coloridos por status
- **Formulário** — cards de Cliente, Matéria-prima, Medidas, Cores, Briefing, Upload PDF; checklist + barra de progresso
- **Detalhe do pedido** — timeline de status, dados, ações por papel, timer de clichê
- **Gestão de usuários** — listar, criar, editar, desativar

Tokens de design (cores, raios, sombras) em `src/styles.css` usando `oklch`.

## Tempo real

Uso Realtime do Supabase para que mudanças apareçam instantaneamente em todos os dispositivos conectados (ex: vendedora envia pedido → designer vê na hora).

## Hospedagem

Publico no Lovable (URL `seu-app.lovable.app`). Funciona em qualquer dispositivo com link. Depois você pode conectar domínio próprio.

## Entrega em fases

Por ser grande, sugiro implementar nesta ordem:
1. **Fase 1 (esta conversa):** Cloud + auth + tabelas + tela de login + painel de pedidos + formulário "Nova solicitação" + envio para o banco
2. **Fase 2:** tela de detalhe com timeline, mudanças de status, upload de anexos pelo designer
3. **Fase 3:** gestão de usuários, realtime, polimento

Confirma que posso começar pela Fase 1?
