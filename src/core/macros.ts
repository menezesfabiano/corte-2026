import type { Alimento, CodModelo, DiaModelo, Item, Macro, Refeicao } from "../data/schema.ts";

/**
 * Macros e kcal. Toda conta de nutriente do app passa por aqui.
 *
 * Duas regras que valem para o arquivo inteiro:
 * 1. kcal e sempre derivado de 4P + 4C + 9G. A tabela de alimentos nao tem campo de kcal.
 * 2. nada e arredondado no meio do caminho. Arredonda so na hora de mostrar.
 */

export type Tabela = Readonly<Record<string, Alimento>>;

export interface Macros {
  p: number;
  c: number;
  g: number;
  fibra: number;
  kcal: number;
}

/** Fatores de Atwater. Fibra e informativa e nao entra na conta. */
export const KCAL_PROT = 4;
export const KCAL_CARB = 4;
export const KCAL_GORD = 9;

export function kcalDe(p: number, c: number, g: number): number {
  return KCAL_PROT * p + KCAL_CARB * c + KCAL_GORD * g;
}

export function zero(): Macros {
  return { p: 0, c: 0, g: 0, fibra: 0, kcal: 0 };
}

export function macros(p: number, c: number, g: number, fibra = 0): Macros {
  return { p, c, g, fibra, kcal: kcalDe(p, c, g) };
}

const RE_QUANTIDADE = /^\s*(-?\d+(?:[.,]\d+)?)\s*(g|ml|un)?\s*$/i;

/** "215 g", "250 ml", "1,5" ou "80" viram numero. Unidade e opcional. */
export function parseQuantidade(q: string): number {
  const m = RE_QUANTIDADE.exec(q);
  if (!m || m[1] === undefined) throw new Error(`quantidade invalida: ${JSON.stringify(q)}`);
  return Number(m[1].replace(",", "."));
}

/** Macros de uma quantidade de um alimento. Os valores da tabela sao por 100 g do pronto. */
export function macrosDe(tabela: Tabela, nome: string, quantidade: number): Macros {
  const a = tabela[nome];
  if (!a) throw new Error(`alimento fora da tabela: ${nome}`);
  const f = quantidade / 100;
  return macros(a[0] * f, a[1] * f, a[2] * f, a[3] * f);
}

export function somar(...partes: readonly Macros[]): Macros {
  let p = 0;
  let c = 0;
  let g = 0;
  let fibra = 0;
  for (const m of partes) {
    p += m.p;
    c += m.c;
    g += m.g;
    fibra += m.fibra;
  }
  return macros(p, c, g, fibra);
}

/** Soma dos itens, sem arredondar em nenhum passo. */
export function macrosItens(tabela: Tabela, itens: readonly Item[]): Macros {
  return somar(...itens.map((it) => macrosDe(tabela, it.n, parseQuantidade(it.q))));
}

/**
 * Macros de uma refeicao do plano. Refeicao livre nao tem itens: vale o valor
 * declarado no plano, que e o teto acordado, nao uma soma de alimentos.
 */
export function macrosRefeicao(tabela: Tabela, ref: Refeicao): Macros {
  if (ref.livre) return macros(ref.m[0], ref.m[1], ref.m[2]);
  return macrosItens(tabela, ref.itens);
}

/** Total do dia: soma exata das refeicoes. O arredondamento acontece uma vez, na exibicao. */
export function totalDia(tabela: Tabela, dia: DiaModelo): Macros {
  return somar(...dia.refs.map((r) => macrosRefeicao(tabela, r)));
}

/**
 * Media semanal de kcal de um bloco, ponderada pela semana padrao
 * (2 dias t11, 2 dias t1630, 1 dia off, 2 dias fds).
 */
export function mediaSemanal(
  tabela: Tabela,
  modelos: Readonly<Record<CodModelo, DiaModelo>>,
  semanaPadrao: Readonly<Partial<Record<CodModelo, number>>>,
): number {
  let soma = 0;
  let dias = 0;
  for (const [cod, peso] of Object.entries(semanaPadrao) as [CodModelo, number][]) {
    const modelo = modelos[cod];
    if (!modelo) throw new Error(`modelo de dia ausente: ${cod}`);
    soma += peso * totalDia(tabela, modelo).kcal;
    dias += peso;
  }
  if (dias === 0) throw new Error("semana padrao sem dias");
  return soma / dias;
}

/** Converte para a tupla [P, C, G, kcal] arredondada, do jeito que a tela mostra. */
export function paraTupla(m: Macros): Macro {
  return [Math.round(m.p), Math.round(m.c), Math.round(m.g), Math.round(m.kcal)];
}

/** Diferenca entre dois conjuntos de macros, util para placar e para o solver. */
export function subtrair(a: Macros, b: Macros): Macros {
  return macros(a.p - b.p, a.c - b.c, a.g - b.g, a.fibra - b.fibra);
}

/** Macros declarados numa tupla do plano, para comparar com o recalculo. */
export function daTupla(m: Macro): Macros {
  return macros(m[0], m[1], m[2]);
}
