# Corte 2026 · prompt para o Claude Code

Cole o texto abaixo como primeira mensagem numa sessão do Claude Code aberta na pasta do repositório `corte-2026`. Antes disso, coloque na raiz do repositório os dois arquivos que acompanham este prompt: `dados.json` (plano completo extraído da versão atual) e `index-v1.html` (versão atual, só como referência visual e de comportamento).

---

## Papel e objetivo

Você vai reconstruir o app **Corte 2026**, um aplicativo pessoal de acompanhamento de um protocolo de corte (perda de gordura com preservação de massa magra) que roda de 24/08/2026 a 31/12/2026. O app existe hoje como um único `index-v1.html` com JavaScript vanilla e dados embutidos. Funciona, mas tem cálculos frágeis, um bug de fuso horário, dados digitados à mão que divergem do plano e nenhuma proteção nas tabelas do Supabase. O objetivo é refazer com a mesma aparência e as mesmas quatro telas, mas com dados separados do código, motor de cálculo testado, autenticação e deploy automatizado.

Usuário único: Fabiano, 2,02 m, atleta de CrossFit, treina 4 ou 5 vezes por semana, em São Paulo (fuso America/Sao_Paulo). Ele é técnico. Não precisa de explicações básicas na interface, precisa de números certos.

Trabalhe em fases e pare ao fim de cada uma para eu revisar. Não avance para a fase seguinte sem confirmação.

## Stack e restrições

Use Vite + TypeScript sem framework de UI. Sem React, sem Tailwind. CSS puro num único arquivo, portando o design atual (fontes Oswald e Inter via Google Fonts, fundo `#0B0B0D`, vermelho `#C8102E`, navegação inferior com 4 abas, cartões com borda esquerda colorida).

Estrutura mínima:

```
corte-2026/
  public/
    manifest.webmanifest
    icons/
  src/
    data/plano.json          ← copiado de dados.json, é a fonte de verdade
    data/schema.ts           ← tipos + validação com zod
    core/macros.ts           ← cálculo de macros e kcal
    core/calculadora.ts      ← solver de substituição
    core/peso.ts             ← regressão, projeção, autorregulação
    core/compras.ts          ← lista de compras derivada do plano
    core/calendario.ts       ← data local, bloco do dia, modelo do dia
    core/*.test.ts           ← vitest
    sync/supabase.ts         ← auth + leitura/escrita
    sync/local.ts            ← cache localStorage e fila offline
    ui/                      ← uma pasta por tela
    main.ts
  supabase/migrations/       ← SQL versionado
  .github/workflows/deploy.yml
  scripts/validar-plano.ts   ← roda no build, falha se o JSON estiver inconsistente
```

Restrições inegociáveis:

1. Todo número exibido vem de função em `src/core/`, com teste. Nenhuma conta na camada de UI.
2. `plano.json` é validado no build. Se um total de dia não bater com a soma das refeições, o build falha.
3. Datas sempre no fuso `America/Sao_Paulo`. Proibido `toISOString().slice(0,10)` para obter "hoje".
4. Offline-first. O app abre e funciona sem rede, com service worker (vite-plugin-pwa) e fila de sincronização.
5. Sem dependências além de: vite, typescript, vitest, zod, @supabase/supabase-js, vite-plugin-pwa.

## Conceitos do protocolo

Você precisa entender o modelo antes de codar, porque as regras de cálculo derivam dele.

**Balanço energético e ritmo.** Peso inicial 96,0 kg, alvo 86,8 kg em 28/12 (semana 19). Perda planejada de 9,2 kg em 18 intervalos semanais, ritmo médio de 0,51 kg por semana. A faixa considerada segura para preservar massa magra é 0,5% a 0,7% do peso corporal por semana, o que sobre 96 kg dá 0,48 a 0,67 kg por semana. Usando 7.700 kcal por kg de tecido adiposo como referência, o déficit acumulado é de cerca de 70.800 kcal, ou 562 kcal por dia em média. Esses são os números que o app mostra como referência na tela Peso.

**Blocos.** O protocolo tem 4 blocos com redução progressiva de calorias, sempre cortando carboidrato e mantendo proteína e gordura:

| Bloco | Semanas | Período | Média semanal | Peso alvo no fim | Mudança |
|---|---|---|---|---|---|
| A | 1 a 3 | 24/08 a 13/09 | 2.549 kcal | 94,5 kg | plano base |
| B | 4 a 8 | 14/09 a 18/10 | 2.466 kcal | 92,0 kg | menos arroz no almoço |
| C | 9 a 14 | 19/10 a 29/11 | 2.410 kcal | 89,2 kg | sai a batata doce do jantar |
| D | 15 a 19 | 30/11 a 31/12 | 2.355 kcal | 86,8 kg | aveia e pão reduzidos |

Degraus entre blocos: 83, 56 e 55 kcal. A média semanal de cada bloco é a média ponderada dos modelos de dia com a semana padrão de 2 dias treino 11h, 2 dias treino 16h30, 1 dia sem treino e 2 dias de fim de semana. Confirme isso com código: `(2·t11 + 2·t1630 + 1·off + 2·fds) / 7` deve reproduzir as médias acima com erro menor que 1 kcal.

**Macros.** Proteína fixa entre 232 g e 236 g por dia nos dias de treino (2,4 g/kg sobre 96 kg, 2,7 g/kg sobre o peso alvo), gordura fixa entre 72 g e 76 g (0,75 g/kg), carboidrato é a variável de ajuste e cai de bloco para bloco e também entre dia de treino, dia sem treino e fim de semana. Fatores de Atwater: 4 kcal/g para proteína e carboidrato, 9 kcal/g para gordura. Fibra é informativa, não entra na conta de kcal.

**Modelos de dia.** Quatro modelos por bloco, escolhidos conforme o dia:

- `t11`: treino às 11h. Janela curta, só 3h15 entre acordar e treinar. Refeição T-3h15 às 07:45, lanche T-45min às 10:15, pós-treino às 12:30.
- `t1630`: treino às 16h30. Almoço às 13:00 é a refeição principal pré-treino (T-3h30), lanche T-45min às 15:45, pós-treino às 18:00.
- `off`: sem treino. Mesma proteína, carboidrato menor, saem as refeições pré-treino.
- `fds`: fim de semana. Cinco eventos e uma refeição livre às 20:00 com teto de 730 kcal e mínimo de 45 g de proteína (o plano registra a livre como 45 P, 70 C, 30 G, que fecha exatamente 730 kcal).

Sábado e domingo são sempre `fds`. Em dia útil o padrão é `t11`, e o usuário pode trocar o modelo do dia na tela Hoje. Essa escolha é persistida por data.

**Tabela de alimentos.** Valores por 100 g do alimento **pronto** (cozido, grelhado, drenado), na ordem `[proteína, carboidrato, gordura, fibra, categoria, unidade]`. Categorias: `prot`, `carb`, `fruta`, `gord`, `outro` (leite), `livre` (legumes e folhas, volume livre). Fonte declarada: TACO 4ª edição e TBCA/USP, com whey e pasta de amendoim pelos rótulos. Mantenha a tabela como está em `dados.json`; não "corrija" valores por conta própria.

**Pesagem.** Uma medida por semana, sempre segunda-feira, informando a **média dos 7 dias anteriores** de peso em jejum, mais cintura em cm. A curva alvo tem 19 pontos (semana 1 em 24/08 com 95,5 kg até semana 19 em 28/12 com 86,8 kg). O app compara a média real com o alvo daquela semana.

**Autorregulação.** Regra de decisão baseada nas duas últimas pesagens:

- duas semanas seguidas mais de 0,5 kg **acima** do alvo: "Antecipe o próximo bloco"
- duas semanas seguidas mais de 0,5 kg **abaixo** do alvo: "Volte um bloco"
- qualquer outro caso com 2 ou mais pesagens: "Siga o cronograma"
- menos de 2 pesagens: "Registre duas semanas"

**Compras.** Lista semanal por bloco, em quantidade a comprar (cru, com casca, em lata), derivada do consumo pronto da semana padrão com folga de 8% e fatores de rendimento. O usuário nunca pesa cru; ele pesa pronto.

## Modelo de dados

Tipos em `src/data/schema.ts`, validados com zod ao carregar `plano.json`:

```ts
type Macro = [p: number, c: number, g: number, kcal: number];

interface Plano {
  blocos: { cod: "A"|"B"|"C"|"D"; semanas: string; periodo: string;
            media: number; peso: string; resumo: string; perda: string }[];
  faixas: { cod: string; inicio: string; fim: string }[];   // ISO, derive de blocos.periodo
  dias: Record<"A"|"B"|"C"|"D", Record<"t11"|"t1630"|"off"|"fds", DiaModelo>>;
  alimentos: Record<string, [number, number, number, number, Categoria, "g"|"ml"]>;
  curva: { n: number; bloco: string; data: string; iso: string; peso: number; cintura: number }[];
  compras: Record<"A"|"B"|"C"|"D", Compras>;   // manter, mas ver regra em core/compras.ts
  parametros: {
    pesoInicial: 96.0;
    faixaSemanal: [0.005, 0.007];
    kcalPorKg: 7700;
    semanaPadrao: { t11: 2; t1630: 2; off: 1; fds: 2 };
    folgaCompras: 0.08;
    rendimento: Record<string, number>;   // ver seção Compras
    livre: { kcalMax: 730; protMin: 45 };
    autorregulacao: { desvioKg: 0.5; semanas: 2 };
    regressaoPontos: 4;
  };
}

interface DiaModelo { nome: string; desc: string; tot: Macro; refs: Refeicao[] }
interface Refeicao { h: string; tag: string; livre: boolean;
                     itens: { n: string; q: string }[]; m: Macro }
```

O bloco `parametros` não existe em `dados.json`. Adicione-o com os valores acima. Tudo que hoje está fixo no código (96 kg, 19 semanas, 0,48 a 0,67, 8%, limiar de 0,5 kg) passa a vir daqui.

Tabelas no Supabase (migração SQL versionada):

```sql
create table corte_pesagens (
  user_id uuid not null references auth.users default auth.uid(),
  data date not null,
  peso numeric(5,2),
  cintura numeric(5,2),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, data)
);

create table corte_refeicoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  data date not null,
  hora text not null,
  refeicao text not null,
  itens jsonb not null,
  p numeric(6,1) not null, c numeric(6,1) not null, g numeric(6,1) not null,
  kcal numeric(7,1) not null,
  criado_em timestamptz not null default now()
);

create table corte_dias (
  user_id uuid not null references auth.users default auth.uid(),
  data date not null,
  modelo text not null check (modelo in ('t11','t1630','off','fds')),
  primary key (user_id, data)
);

alter table corte_pesagens enable row level security;
alter table corte_refeicoes enable row level security;
alter table corte_dias enable row level security;
-- uma policy por tabela: for all using (auth.uid() = user_id) with check (auth.uid() = user_id)
```

O `id` das refeições é gerado no cliente (`crypto.randomUUID()`) antes de salvar, para que apagar funcione mesmo offline. Hoje o app só consegue apagar uma refeição depois de ter refeito o fetch do servidor.

## Regras de cálculo

Cada regra vira uma função pura em `src/core/` com teste em vitest. Os testes usam os números de `plano.json` como oráculo.

### Data e calendário (`calendario.ts`)

`hojeISO()` retorna a data local em `America/Sao_Paulo` no formato `YYYY-MM-DD`, usando `Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" })` ou equivalente. O bug atual: `new Date().toISOString()` devolve UTC, então das 21h às 23h59 em São Paulo o app acha que já é amanhã e registra refeições e pesagens no dia errado.

`blocoDe(iso)` devolve o bloco pela faixa de datas. Antes de 24/08 devolve A; depois de 31/12 devolve D.

`modeloDe(iso, override)` devolve `fds` para sábado e domingo (dia da semana calculado em fuso local), senão o override salvo em `corte_dias`, senão `t11`.

`semanaDe(iso)` devolve o ponto da curva cuja segunda-feira é a mais recente até a data.

### Macros de uma refeição (`macros.ts`)

```
para cada item: quantidade × alimento[macro] / 100
P, C, G somados sem arredondar
kcal = 4·P + 4·C + 9·G
```

Nunca use um campo de kcal da tabela de alimentos; kcal é sempre derivado. Arredonde só na exibição. A quantidade vem da string `"215 g"` ou `"250 ml"`: parse com vírgula ou ponto decimal, unidade opcional.

Teste obrigatório: para cada refeição não livre de `plano.json`, recalcular a partir dos itens e comparar com `m`. Tolerância: 1 g em P, C, G e 15 kcal. Hoje isso passa em todas as 84 refeições. Mantenha passando.

### Totais de dia e média de bloco

Total do dia = soma das refeições **sem arredondar**, arredondado uma vez no fim. Hoje `tot` foi calculado somando valores já arredondados e diverge em 1 a 2 g em 16 dos 16 modelos. Recalcule `tot` a partir dos itens no script de validação e regrave `plano.json` com os valores corretos. O `desc` e o `nome` não mudam.

Média do bloco = `Σ(peso_modelo × tot_kcal_modelo) / 7` com `semanaPadrao`. O script de validação compara com `blocos[].media` e falha se a diferença passar de 1 kcal.

### Calculadora de substituição (`calculadora.ts`)

Problema: dada uma refeição alvo `(aP, aC, aG)` e um conjunto de alimentos que o usuário tem em casa, achar quantidades que cheguem o mais perto possível do alvo.

O algoritmo atual faz 5 iterações de ajuste sequencial por categoria, divide o alvo igualmente entre alimentos da mesma categoria e ignora leite e legumes. Substitua por algo que:

1. Separa alimentos em **fixos** e **variáveis**. Leite (`outro`) e itens `livre` entram com quantidade fixa: leite 250 ml, legumes 200 g, folhas 100 g. O usuário pode editar depois. Os macros dos fixos são subtraídos do alvo antes de resolver.
2. Resolve os variáveis por mínimos quadrados ponderados com restrição de não negatividade (NNLS, implementação própria de 30 linhas, ou projeção iterativa com no máximo 50 iterações e critério de parada por variação menor que 0,1 g). Pesos dos resíduos: proteína 3, carboidrato 1, gordura 2. Motivo: numa fase de corte, errar proteína custa mais que errar carboidrato.
3. Respeita porção mínima de 10 g (ou 50 ml) por alimento variável escolhido. Se a solução der abaixo disso, zera o alimento e resolve de novo sem ele.
4. Arredonda cada quantidade para múltiplo de 5 g (ou 10 ml) **depois** de resolver, e recalcula os macros finais com as quantidades arredondadas. O que aparece na tela é o macro real das gramas exibidas, não o macro teórico da solução contínua.
5. Emite avisos sobre o resíduo final: proteína faltando mais de 10 g, carboidrato faltando mais de 15 g, gordura sobrando mais de 5 g (com o custo em kcal), e sugestão de azeite quando não há gordura selecionada e faltam mais de 3 g.

Testes: (a) frango + arroz + azeite contra a refeição das 12:30 do modelo t11 do bloco A deve devolver 170 g, 215 g e 13 g com erro máximo de 5 g em cada; (b) só proteína selecionada não pode gerar quantidade negativa nem NaN; (c) whey + banana + leite fixo contra a refeição das 07:45; (d) alimentos com macro zero na categoria (mel como "carb" com gordura zero) não podem gerar divisão por zero.

### Peso, ritmo e projeção (`peso.ts`)

`ritmo(pontos)`: regressão linear simples sobre os últimos `regressaoPontos` (4) pares `(semana, peso)`. Devolve a inclinação em kg por semana, negativa quando perdendo. Com menos de 2 pontos devolve `null`. Guarde também o R² para mostrar quão consistente o ritmo está.

`projecao(ultimo, ritmo)`: `peso_ultimo + ritmo × (19 − semana_ultimo)`. Só com ritmo válido.

`desvio(semana)`: `peso_real − peso_alvo` daquela semana.

`perdido()`: `parametros.pesoInicial − peso_real_mais_recente`. Hoje o 96 está fixo dentro do HTML.

`acao(desvios)`: a regra de autorregulação descrita nos conceitos, parametrizada por `desvioKg` e `semanas`.

Testes com séries sintéticas: 4 pontos em linha reta devolvem a inclinação exata; 2 pontos acima de 0,5 devolvem "Antecipe"; sequência alternada devolve "Siga o cronograma".

### Compras (`compras.ts`)

Substitua a lista digitada à mão por uma lista **derivada do plano**. Para cada alimento do bloco:

```
pronto_semana  = Σ (quantidade_na_refeição × ocorrências_do_modelo_na_semana_padrão)
pronto_folga   = pronto_semana × (1 + folgaCompras)
comprar        = pronto_folga / rendimento[alimento]
```

Fatores de rendimento (pronto ÷ cru, ou pronto ÷ comprado), a colocar em `parametros.rendimento`:

| Alimento | Fator | Leitura |
|---|---|---|
| Patinho, peito de frango | 0,70 | 1 kg cru rende 700 g grelhado |
| Arroz branco | 2,60 | 100 g cru rende 260 g cozido |
| Feijão carioca | 2,20 | 100 g cru rende 220 g cozido |
| Banana prata | 0,64 | peso com casca |
| Batata doce | 0,87 | peso com casca |
| Atum em lata | 120 g drenado por lata de 170 g | arredondar latas para cima |
| Ovo | 50 g por unidade sem casca | arredondar unidades para cima |
| Pão francês | 50 g por unidade | arredondar para cima |
| Leite | caixa de 1 L | mostrar litros e caixas |
| Demais | 1,00 | |

Teste: para o bloco A, a lista derivada deve reproduzir patinho 988 g (692 g prontos), frango 1,90 kg, feijão 545 g, leite 4,06 L e aveia 367 g com erro menor que 2%. Arroz, whey e legumes da lista atual não batem com a semana padrão (arroz 453 g contra cerca de 428 g derivados); a lista derivada é a correta e substitui a digitada. Mostre-me a tabela de diferenças antes de trocar.

Agrupe por seção de mercado (Açougue, Ovos, Laticínios, Hortifruti, Mercearia, Padaria, Suplemento) e mantenha as notas de rendimento embaixo de cada item, como hoje.

### Registro de refeições e placar do dia

O placar da tela Hoje soma `p, c, g, kcal` das refeições registradas na data local. "Comi isso" num cartão do plano registra os itens e macros daquela refeição. "Registrar como comido" na calculadora registra as quantidades arredondadas e os macros recalculados delas. Ambos gravam localmente na hora, enfileiram para o Supabase e marcam o estado de sincronização no cabeçalho.

## Telas

Mantenha as quatro abas e a hierarquia visual de `index-v1.html`. Mudanças de comportamento:

**Hoje.** Seletor de modelo do dia (persistido em `corte_dias`, não só em localStorage). Placar com 4 números contra o alvo do modelo. Lista do que foi registrado com botão apagar. Plano do dia com "Comi isso" por refeição. Refeição livre mostra teto de kcal e mínimo de proteína vindos de `parametros`.

**Calcular.** Seletor de refeição fixo no topo, chips de alimentos por categoria (incluindo leite e legumes como fixos editáveis), barra de resultado fixa acima da navegação que abre e fecha. Quantidades em múltiplos de 5 g. Avisos do solver. Botões registrar e limpar.

**Peso.** Formulário para a segunda-feira corrente com peso (média de 7 dias) e cintura. Painel com semanas registradas, perdido desde o início, ritmo real com R², projeção para 28/12, ação de autorregulação. Gráfico SVG com curva alvo, pontos reais e projeção tracejada. Tabela de histórico com desvio colorido (verde até 0,5 kg, âmbar acima). Mantenha o gráfico em SVG gerado à mão, sem biblioteca.

**Compras.** Lista derivada do bloco corrente, com período, quantidade a comprar e nota de rendimento.

**Cabeçalho.** Bloco corrente, média de kcal do bloco, indicador de sincronização (verde sincronizado, âmbar pendente, cinza sem login) e botão de entrar ou sair.

## Autenticação e sincronização

Login por magic link do Supabase Auth, e-mail único. Sem senha. A publishable key fica em `.env` e é injetada no build via `import.meta.env`; ela pode ser pública porque RLS garante que só o usuário autenticado lê e escreve as próprias linhas.

Fluxo offline-first:

1. Toda escrita vai primeiro para o cache local (localStorage ou IndexedDB, sua escolha, justifique).
2. Uma fila de operações pendentes é drenada quando há rede e sessão válida.
3. Ao abrir o app com sessão, faz pull das três tabelas e sobrescreve o cache local. Conflito é resolvido por `atualizado_em` mais recente para pesagens e dias; refeições não conflitam porque têm id único.
4. Sem sessão, o app funciona inteiro com dados locais e mostra "salvo só neste aparelho".

## Qualidade e entrega

- `npm test` roda todos os testes de `src/core/`. Cobertura mínima de 90% nessa pasta.
- `npm run validar` roda `scripts/validar-plano.ts` e é chamado no `prebuild`.
- `npm run build` gera `dist/` com PWA (manifest, ícone 192 e 512, service worker com cache dos assets e do `plano.json`).
- `.github/workflows/deploy.yml` faz build e publica `dist/` no GitHub Pages a cada push em `main`. Configure `base` do Vite para `/corte-2026/`.
- README curto com: como rodar local, como configurar `.env`, como aplicar a migração no Supabase, como o plano é validado.
- Não use travessão em nenhum texto da interface. Use ponto, vírgula ou dois-pontos.
- Idioma da interface: português brasileiro, com vírgula decimal na exibição.

## Fases

1. **Fundação.** Estrutura do projeto, `schema.ts`, carga de `plano.json`, `calendario.ts` e `macros.ts` com testes, `validar-plano.ts` rodando e apontando as 16 divergências de `tot`. Pare e me mostre o relatório de validação.
2. **Motor.** `calculadora.ts`, `peso.ts`, `compras.ts` com testes. Pare e me mostre a tabela comparando lista de compras derivada contra a digitada, bloco a bloco.
3. **Dados e auth.** Migração SQL, policies de RLS, `sync/`. Pare e me mostre o SQL antes de eu aplicar.
4. **Interface.** As quatro telas, portando o CSS atual. Pare com screenshots das quatro abas em viewport de 390 px.
5. **Entrega.** PWA, workflow de deploy, README. Pare com o link do GitHub Pages funcionando.

Ao terminar cada fase, liste o que foi feito, o que ficou de fora e as decisões que você tomou sem me perguntar.
