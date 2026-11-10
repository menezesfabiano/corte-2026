import type { Parametros } from "../data/schema.ts";
import { kcalDe, macros, somar, type Macros } from "./macros.ts";

/**
 * Registros de um toque do plano v2: doce oficial e caminhada.
 *
 * Os dois entram como refeicao registrada, para aproveitar o cache local e a
 * sincronizacao que ja existem. A caminhada vai com macro zero e e reconhecida
 * pelo nome.
 */

export const NOME_DOCE = "Doce oficial";
export const NOME_CAMINHADA = "Caminhada";

/** O que o repositorio precisa para registrar. Mesmo formato de EntradaRefeicao. */
export interface EntradaExtra {
  data: string;
  hora: string;
  refeicao: string;
  itens: { n: string; q: string }[];
  p: number;
  c: number;
  g: number;
  kcal: number;
}

/** Macros do doce oficial, com a kcal derivada dos macros e nao declarada a parte. */
export function macrosDoce(parametros: Parametros): Macros {
  const { p, c, g } = parametros.doce;
  return macros(p, c, g);
}

export function entradaDoce(parametros: Parametros, data: string, hora: string): EntradaExtra {
  const m = macrosDoce(parametros);
  return {
    data,
    hora,
    refeicao: NOME_DOCE,
    itens: [{ n: "Doce do dia", q: `até ${parametros.doce.kcalMax} kcal` }],
    p: m.p,
    c: m.c,
    g: m.g,
    kcal: m.kcal,
  };
}

export function entradaCaminhada(parametros: Parametros, data: string, hora: string): EntradaExtra {
  return {
    data,
    hora,
    refeicao: NOME_CAMINHADA,
    itens: [{ n: "Caminhada", q: `${parametros.caminhada.minutos} min` }],
    p: 0,
    c: 0,
    g: 0,
    kcal: kcalDe(0, 0, 0),
  };
}

export function ehCaminhada(registro: { refeicao: string }): boolean {
  return registro.refeicao === NOME_CAMINHADA;
}

export function ehDoce(registro: { refeicao: string }): boolean {
  return registro.refeicao === NOME_DOCE;
}

/** Meta do dia: o cardapio do modelo mais o doce oficial. */
export function metaDoDia(cardapio: Macros, parametros: Parametros): Macros {
  return somar(cardapio, macrosDoce(parametros));
}
