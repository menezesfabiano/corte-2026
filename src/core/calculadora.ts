import type { Categoria, Parametros } from "../data/schema.ts";
import { macros, macrosDe, somar, subtrair, zero, type Macros, type Tabela } from "./macros.ts";

/**
 * Calculadora de substituicao.
 *
 * Problema: dado um alvo de macros e os alimentos que o usuario tem em casa,
 * achar as gramas que chegam mais perto do alvo.
 *
 * Solucao: minimos quadrados ponderados com restricao de nao negatividade,
 * resolvido por descida coordenada. Em fase de corte errar proteina custa mais
 * que errar carboidrato, entao o residuo de cada macro entra com peso diferente.
 */

export interface Fixo {
  nome: string;
  quantidade: number;
}

export interface ItemResolvido {
  nome: string;
  quantidade: number;
  unidade: "g" | "ml";
  fixo: boolean;
  m: Macros;
}

export type TipoAviso = "prot" | "carb" | "gord" | "azeite";

export interface Aviso {
  tipo: TipoAviso;
  texto: string;
}

export interface Resultado {
  itens: ItemResolvido[];
  alvo: Macros;
  /** Macros reais das gramas exibidas, ja arredondadas. */
  total: Macros;
  /** Alvo menos total. Positivo quer dizer que falta. */
  residuo: Macros;
  avisos: Aviso[];
  iteracoes: number;
  /** Alimentos que sairam por ficarem abaixo da porcao minima. */
  descartados: string[];
}

const AZEITE = "Azeite";

function nf(x: number, casas = 0): string {
  return x.toFixed(casas).replace(".", ",");
}

function unidadeDe(tabela: Tabela, nome: string): "g" | "ml" {
  const a = tabela[nome];
  if (!a) throw new Error(`alimento fora da tabela: ${nome}`);
  return a[5];
}

function categoriaDe(tabela: Tabela, nome: string): Categoria {
  const a = tabela[nome];
  if (!a) throw new Error(`alimento fora da tabela: ${nome}`);
  return a[4];
}

/** Quantidade padrao de um item fixo: por nome primeiro, por categoria depois. */
export function porcaoFixa(tabela: Tabela, nome: string, parametros: Parametros): number {
  const porNome = parametros.porcoesFixas[nome];
  if (porNome !== undefined) return porNome;
  const porCategoria = parametros.porcoesFixas[categoriaDe(tabela, nome)];
  if (porCategoria !== undefined) return porCategoria;
  return unidadeDe(tabela, nome) === "ml" ? parametros.solver.minimoMl : parametros.solver.minimoG;
}

/** Leite e itens de volume livre entram com quantidade fixa. O resto o solver resolve. */
export function separar(
  tabela: Tabela,
  selecionados: readonly string[],
  parametros: Parametros,
): { fixos: Fixo[]; variaveis: string[] } {
  const fixos: Fixo[] = [];
  const variaveis: string[] = [];
  for (const nome of selecionados) {
    const cat = categoriaDe(tabela, nome);
    if (cat === "outro" || cat === "livre") {
      fixos.push({ nome, quantidade: porcaoFixa(tabela, nome, parametros) });
    } else {
      variaveis.push(nome);
    }
  }
  return { fixos, variaveis };
}

/**
 * Minimos quadrados ponderados com x entre zero e um teto, por descida coordenada.
 * A e 3 por n, em macro por grama. b e o alvo. Cada coordenada tem solucao fechada,
 * entao cada passo ja e otimo para aquele alimento e o erro so cai.
 *
 * O teto existe porque a matematica sozinha resolve 70 g de proteina com 75 g de
 * whey no almoco. Certo na conta, errado na vida.
 */
function nnls(
  A: readonly (readonly [number, number, number])[],
  b: readonly [number, number, number],
  pesos: readonly [number, number, number],
  tetos: readonly number[],
  maxIteracoes: number,
  tolerancia: number,
): { x: number[]; iteracoes: number } {
  const n = A.length;
  const x = new Array<number>(n).fill(0);
  if (n === 0) return { x, iteracoes: 0 };

  // denominador de cada coordenada, fixo ao longo das iteracoes
  const den = A.map((col) => pesos[0] * col[0] ** 2 + pesos[1] * col[1] ** 2 + pesos[2] * col[2] ** 2);
  // residuo corrente: A x menos b, comecando de x igual a zero
  const r: [number, number, number] = [-b[0], -b[1], -b[2]];

  let iteracoes = 0;
  for (let passo = 0; passo < maxIteracoes; passo += 1) {
    iteracoes = passo + 1;
    let maiorMudanca = 0;
    for (let j = 0; j < n; j += 1) {
      const d = den[j]!;
      if (d <= 0) continue; // alimento sem macro nenhum, nao ha o que resolver
      const col = A[j]!;
      const xj = x[j]!;
      // residuo sem a contribuicao deste alimento
      const num =
        pesos[0] * col[0] * (r[0] - col[0] * xj) +
        pesos[1] * col[1] * (r[1] - col[1] * xj) +
        pesos[2] * col[2] * (r[2] - col[2] * xj);
      const novo = Math.min(tetos[j] ?? Infinity, Math.max(0, -num / d));
      const delta = novo - xj;
      if (delta === 0) continue;
      r[0] += col[0] * delta;
      r[1] += col[1] * delta;
      r[2] += col[2] * delta;
      x[j] = novo;
      maiorMudanca = Math.max(maiorMudanca, Math.abs(delta));
    }
    if (maiorMudanca < tolerancia) break;
  }
  return { x, iteracoes };
}

function arredondarPasso(valor: number, passo: number): number {
  return Math.round(valor / passo) * passo;
}

/**
 * Zera o peso do macro que a selecao nao tem como servir.
 *
 * Sem isso acontece o seguinte: o usuario marca so proteinas, o carboidrato fica
 * 90 g longe do alvo e, como o erro de carboidrato e enorme, o solver passa a
 * escolher a proteina que traz carboidrato de brinde. Resultado: queijo e whey no
 * almoco em vez de frango. O macro inalcancavel nao pode dirigir a escolha dos
 * outros. Quem avisa que falta carboidrato e o aviso, nao o solver.
 */
function pesosUteis(
  tabela: Tabela,
  variaveis: readonly string[],
  alvo: readonly [number, number, number],
  parametros: Parametros,
): [number, number, number] {
  const cfg = parametros.solver;
  const base: [number, number, number] = [cfg.pesos.p, cfg.pesos.c, cfg.pesos.g];
  const alcance: [number, number, number] = [0, 0, 0];

  for (const nome of variaveis) {
    const a = tabela[nome];
    if (!a) continue;
    const teto = parametros.maximos[nome] ?? cfg.porcaoTeorica;
    alcance[0] += (a[0] / 100) * teto;
    alcance[1] += (a[1] / 100) * teto;
    alcance[2] += (a[2] / 100) * teto;
  }

  const usados = base.map((peso, i) =>
    alvo[i]! > 0 && alcance[i]! < cfg.alcanceMinimo * alvo[i]! ? 0 : peso,
  ) as [number, number, number];

  // se nada e alcancavel, volta ao peso original: melhor um palpite que nenhum
  return usados.some((p) => p > 0) ? usados : base;
}

export interface OpcoesResolver {
  alvo: Macros;
  variaveis: readonly string[];
  fixos?: readonly Fixo[];
  parametros: Parametros;
}

export function resolver(tabela: Tabela, opcoes: OpcoesResolver): Resultado {
  const { alvo, parametros } = opcoes;
  const cfg = parametros.solver;
  const fixos = opcoes.fixos ?? [];

  const macrosFixos = fixos.length > 0 ? somar(...fixos.map((f) => macrosDe(tabela, f.nome, f.quantidade))) : zero();
  const restante = subtrair(alvo, macrosFixos);
  const b: [number, number, number] = [restante.p, restante.c, restante.g];
  const pesos = pesosUteis(tabela, opcoes.variaveis, b, parametros);

  let ativos = [...opcoes.variaveis];
  const descartados: string[] = [];
  let x: number[] = [];
  let iteracoes = 0;

  // porcao minima: se o solver pedir menos que isso, o alimento sai e resolve de novo
  for (let tentativa = 0; tentativa <= opcoes.variaveis.length; tentativa += 1) {
    const A = ativos.map((nome) => {
      const a = tabela[nome];
      if (!a) throw new Error(`alimento fora da tabela: ${nome}`);
      return [a[0] / 100, a[1] / 100, a[2] / 100] as const;
    });
    const tetos = ativos.map((nome) => parametros.maximos[nome] ?? Infinity);
    const saida = nnls(A, b, pesos, tetos, cfg.iteracoes, cfg.toleranciaG);
    x = saida.x;
    iteracoes += saida.iteracoes;

    let pior = -1;
    let piorValor = Infinity;

    // 1. quantidade abaixo da porcao minima nao vira comida de verdade
    for (let j = 0; j < ativos.length; j += 1) {
      const nome = ativos[j]!;
      const minimo = unidadeDe(tabela, nome) === "ml" ? cfg.minimoMl : cfg.minimoG;
      const valor = x[j]!;
      if (valor > 0 && valor < minimo && valor < piorValor) {
        pior = j;
        piorValor = valor;
      }
    }

    // 2. ninguem monta um prato com quatro proteinas diferentes. Sobrando fonte
    //    na mesma categoria, sai a menor e o solver resolve de novo com o resto.
    if (pior < 0) {
      const porCategoria = new Map<Categoria, number[]>();
      for (let j = 0; j < ativos.length; j += 1) {
        if ((x[j] ?? 0) <= 0) continue;
        const cat = categoriaDe(tabela, ativos[j]!);
        const lista = porCategoria.get(cat);
        if (lista) lista.push(j);
        else porCategoria.set(cat, [j]);
      }
      for (const indices of porCategoria.values()) {
        if (indices.length <= cfg.maxPorCategoria) continue;
        for (const j of indices) {
          if (x[j]! < piorValor) {
            pior = j;
            piorValor = x[j]!;
          }
        }
      }
    }

    if (pior < 0) break;
    descartados.push(ativos[pior]!);
    ativos = ativos.filter((_, j) => j !== pior);
  }

  const itens: ItemResolvido[] = fixos.map((f) => ({
    nome: f.nome,
    quantidade: f.quantidade,
    unidade: unidadeDe(tabela, f.nome),
    fixo: true,
    m: macrosDe(tabela, f.nome, f.quantidade),
  }));

  for (let j = 0; j < ativos.length; j += 1) {
    const nome = ativos[j]!;
    const unidade = unidadeDe(tabela, nome);
    const passo = unidade === "ml" ? cfg.passoMl : cfg.passoG;
    // arredonda depois de resolver e recalcula: o que aparece na tela e o macro real das gramas
    const quantidade = arredondarPasso(x[j]!, passo);
    if (quantidade <= 0) continue;
    itens.push({ nome, quantidade, unidade, fixo: false, m: macrosDe(tabela, nome, quantidade) });
  }

  const total = itens.length > 0 ? somar(...itens.map((i) => i.m)) : zero();
  const residuo = subtrair(alvo, total);

  const marcados = [...fixos.map((f) => f.nome), ...opcoes.variaveis];
  return {
    itens,
    alvo,
    total,
    residuo,
    avisos: avisar(tabela, marcados, residuo, parametros),
    iteracoes,
    descartados,
  };
}

/** De onde vem cada macro, para o aviso dizer o que marcar em vez de so reclamar. */
const FONTES: Record<"prot" | "carb", { categorias: readonly Categoria[]; exemplos: string }> = {
  prot: { categorias: ["prot"], exemplos: "frango, patinho, atum ou ovo" },
  carb: { categorias: ["carb", "fruta"], exemplos: "arroz, batata doce, pão ou uma fruta" },
};

function temFonte(tabela: Tabela, selecionados: readonly string[], categorias: readonly Categoria[]): boolean {
  return selecionados.some((nome) => categorias.includes(categoriaDe(tabela, nome)));
}

/**
 * Avisos sobre o que sobrou de erro depois de arredondar.
 * Olha o que foi marcado, nao o que o solver usou: marcar mel e ele nao servir
 * para nada sao duas conversas diferentes.
 */
export function avisar(
  tabela: Tabela,
  selecionados: readonly string[],
  residuo: Macros,
  parametros: Parametros,
): Aviso[] {
  const lim = parametros.solver.avisos;
  const avisos: Aviso[] = [];

  if (residuo.p > lim.protFalta) {
    const fonte = FONTES.prot;
    avisos.push({
      tipo: "prot",
      texto: temFonte(tabela, selecionados, fonte.categorias)
        ? `Faltam ${nf(residuo.p)} g de proteína. O que está marcado não fecha o alvo.`
        : `Faltam ${nf(residuo.p)} g de proteína e você não marcou nenhuma fonte. Marque ${fonte.exemplos}.`,
    });
  }
  if (residuo.c > lim.carbFalta) {
    const fonte = FONTES.carb;
    avisos.push({
      tipo: "carb",
      texto: temFonte(tabela, selecionados, fonte.categorias)
        ? `Faltam ${nf(residuo.c)} g de carboidrato. O que está marcado não fecha o alvo.`
        : `Faltam ${nf(residuo.c)} g de carboidrato e você não marcou nenhuma fonte. Marque ${fonte.exemplos}.`,
    });
  }
  if (-residuo.g > lim.gordSobra) {
    const sobra = -residuo.g;
    avisos.push({
      tipo: "gord",
      texto: `Sobram ${nf(sobra)} g de gordura, ${nf(sobra * 9)} kcal a mais do que o alvo.`,
    });
  }

  const temGordura = temFonte(tabela, selecionados, ["gord"]);
  if (!temGordura && residuo.g > lim.azeiteFalta && tabela[AZEITE]) {
    const passo = parametros.solver.passoG;
    const sugestao = Math.max(passo, arredondarPasso(residuo.g, passo));
    avisos.push({
      tipo: "azeite",
      texto: `Faltam ${nf(residuo.g)} g de gordura. ${sugestao} g de azeite resolvem.`,
    });
  }

  return avisos;
}

/** Alvo de macros de uma refeicao do plano, do jeito que a calculadora consome. */
export function alvoDaRefeicao(m: readonly [number, number, number, number]): Macros {
  return macros(m[0], m[1], m[2]);
}
