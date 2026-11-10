# Corte 2026

App pessoal de acompanhamento de um protocolo de corte, de 24/08 a 31/12 de 2026. Cinco telas: Hoje, Calcular, Peso, Compras e Regras. Roda offline, sincroniza com o Supabase quando há login.

## Plano v2

Desde 31/10/2026 vale o plano v2: curva nova de 96,0 kg em 31/10 a 89,8 kg em 30/12, doce oficial de até 150 kcal por dia e caminhada diária. O que isso muda no app:

- A tela Hoje é consulta do plano. Não se marca refeição a refeição; registra-se só o que foge dele: doce oficial, caminhada e o que sair da calculadora. O rodapé mostra a meta do dia, cardápio mais doce.
- O modelo de dia escolhido vale em qualquer dia, inclusive sábado e domingo.
- A tela Peso mede o tempo em semanas reais desde a partida (`parametros.partida`), porque a partida e o fechamento (`parametros.fechamento`) não caem em segunda-feira. A leitura olha o ritmo dos dois últimos intervalos entre pesagens (`parametros.ritmo`), não o desvio contra o alvo.
- Doce e caminhada entram como refeição registrada, para aproveitar o cache local e a sincronização. A caminhada vai com macro zero e é reconhecida pelo nome (`src/core/extras.ts`).

## Rodar local

Precisa de Node 22.6 ou mais novo (o validador roda TypeScript direto no Node).

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173/corte-2026/`. Sem `.env` o app funciona inteiro, com os dados salvos só no aparelho.

## Configurar o Supabase

1. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (Project Settings, API). A publishable key pode ser pública: o RLS garante que cada usuário só lê e escreve as próprias linhas.
2. Aplique as migrações de `supabase/migrations/`, em ordem, no SQL Editor do painel, ou com a CLI:

```bash
npx supabase db push
```

3. Em Authentication, habilite login por e-mail (magic link). Como o app é de uma pessoa só, vale desligar novos cadastros depois do primeiro login.

No GitHub, as mesmas duas variáveis vão em Settings, Secrets and variables, Actions, aba Variables. O workflow lê de `vars`.

## Como o plano é validado

`src/data/plano.json` é a fonte de verdade: blocos, modelos de dia, refeições, tabela de alimentos, curva de peso e parâmetros. `scripts/validar-plano.ts` roda no `prebuild` e derruba o build se:

- alguma refeição não bater com o recálculo a partir dos itens (tolerância 1 g por macro, 15 kcal);
- o total de algum modelo de dia não bater com a soma exata das refeições;
- a média de algum bloco fugir mais de 1 kcal da semana padrão `(2·t11 + 2·t1630 + 1·off + 2·fds) / 7`;
- as faixas de data tiverem buraco ou sobreposição, ou a curva sair de segunda-feira em segunda-feira;
- a partida não vier antes da semana 1, o fechamento vier antes da última semana, ou o ritmo do plano ficar fora dos limites de `parametros.ritmo`;
- o doce oficial passar do teto de kcal;
- algum alimento usado no plano estiver fora da tabela ou sem seção de mercado.

Para rodar só a validação:

```bash
npm run validar
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor local |
| `npm test` | testes de `src/core/` e `src/sync/` |
| `npm run cobertura` | testes com cobertura, mínimo 90% no core |
| `npm run validar` | valida `plano.json` |
| `npm run build` | valida, tipa e gera `dist/` com PWA |
| `npm run icones` | regenera os ícones em `public/icons/` |

## Deploy

Todo push em `main` roda `.github/workflows/deploy.yml`: testa, valida, faz o build e publica `dist/` no GitHub Pages. O `base` do Vite é `/corte-2026/`.

## Estrutura

```
src/data/       plano.json e o schema zod
src/core/       toda a matemática, com testes
src/sync/       cache local, fila offline e Supabase
src/ui/         as quatro telas e a casca
scripts/        validação do plano e geração de ícones
supabase/       migração SQL
referencia/     lista de compras da v1, só para conferência histórica
```

Regra da casa: nenhum número exibido nasce na camada de UI. Tudo vem de função em `src/core/`, com teste.
