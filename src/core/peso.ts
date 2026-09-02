import type { Parametros, PontoCurva } from "../data/schema.ts";
import { semanaDe } from "./calendario.ts";

/**
 * Peso: ritmo real, projecao e autorregulacao.
 *
 * A medida e sempre a media dos 7 dias anteriores, informada na segunda-feira.
 * Aqui dentro nao existe peso de um dia so, existe ponto de semana.
 */

export interface Pesagem {
  /** Data ISO da pesagem, normalmente uma segunda-feira. */
  data: string;
  /** Media dos 7 dias anteriores, em kg. */
  peso: number;
  cintura: number | null;
}

export interface SemanaPesada {
  n: number;
  /** Data em que a pesagem foi registrada. */
  data: string;
  peso: number;
  cintura: number | null;
  /** Peso alvo da curva naquela semana. */
  alvo: number;
  /** Real menos alvo. Positivo quer dizer acima do alvo, ou seja, atrasado. */
  desvio: number;
}

export interface Ritmo {
  /** kg por semana. Negativo quando esta perdendo. */
  inclinacao: number;
  /** Quanto o ritmo e consistente, de 0 a 1. */
  r2: number;
  /** Quantos pontos entraram na regressao. */
  pontos: number;
}

export type CodigoAcao = "antecipar" | "voltar" | "seguir" | "aguardar";

export interface Acao {
  codigo: CodigoAcao;
  texto: string;
  detalhe: string;
}

/**
 * Casa as pesagens registradas com as semanas da curva. Duas pesagens na mesma
 * semana viram uma so, a mais recente.
 */
export function semanasPesadas(
  pesagens: readonly Pesagem[],
  curva: readonly PontoCurva[],
): SemanaPesada[] {
  const porSemana = new Map<number, SemanaPesada>();
  for (const p of pesagens) {
    const ponto = semanaDe(p.data, curva);
    if (!ponto) continue; // pesagem anterior a semana 1 nao entra na curva
    const anterior = porSemana.get(ponto.n);
    if (anterior && anterior.data >= p.data) continue;
    porSemana.set(ponto.n, {
      n: ponto.n,
      data: p.data,
      peso: p.peso,
      cintura: p.cintura,
      alvo: ponto.peso,
      desvio: p.peso - ponto.peso,
    });
  }
  return [...porSemana.values()].sort((a, b) => a.n - b.n);
}

/**
 * Regressao linear de peso sobre semana, nos ultimos pontos. Devolve a inclinacao
 * em kg por semana e o R2. Menos de 2 pontos nao da ritmo nenhum.
 */
export function ritmo(semanas: readonly SemanaPesada[], quantos: number): Ritmo | null {
  const usados = semanas.slice(-quantos);
  if (usados.length < 2) return null;

  const n = usados.length;
  const mediaX = usados.reduce((s, p) => s + p.n, 0) / n;
  const mediaY = usados.reduce((s, p) => s + p.peso, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of usados) {
    const dx = p.n - mediaX;
    const dy = p.peso - mediaY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const inclinacao = sxy / sxx;
  let residuo = 0;
  for (const p of usados) {
    const previsto = mediaY + inclinacao * (p.n - mediaX);
    residuo += (p.peso - previsto) ** 2;
  }
  const r2 = syy === 0 ? 1 : Math.max(0, 1 - residuo / syy);
  return { inclinacao, r2, pontos: n };
}

/** Onde o peso chega na ultima semana da curva se o ritmo atual continuar. */
export function projecao(
  semanas: readonly SemanaPesada[],
  r: Ritmo | null,
  curva: readonly PontoCurva[],
): number | null {
  const ultimo = semanas[semanas.length - 1];
  const fim = curva[curva.length - 1];
  if (!ultimo || !fim || !r) return null;
  return ultimo.peso + r.inclinacao * (fim.n - ultimo.n);
}

/** Quanto ja saiu desde o peso inicial. Positivo quer dizer perdido. */
export function perdido(semanas: readonly SemanaPesada[], pesoInicial: number): number | null {
  const ultimo = semanas[semanas.length - 1];
  return ultimo ? pesoInicial - ultimo.peso : null;
}

/** Faixa semanal segura em kg, dos percentuais do plano sobre um peso. */
export function faixaSeguraKg(parametros: Parametros, peso: number): [number, number] {
  const [piso, teto] = parametros.faixaSemanal;
  return [piso * peso, teto * peso];
}

/**
 * Autorregulacao. Duas semanas seguidas acima do alvo pedem antecipar o bloco,
 * duas seguidas abaixo pedem voltar um bloco. O resto e seguir o cronograma.
 */
export function acao(
  semanas: readonly SemanaPesada[],
  regra: Parametros["autorregulacao"],
): Acao {
  const ultimas = semanas.slice(-regra.semanas);
  if (ultimas.length < regra.semanas) {
    return {
      codigo: "aguardar",
      texto: `Registre ${regra.semanas} semanas`,
      detalhe: `${ultimas.length} de ${regra.semanas} pesagens registradas.`,
    };
  }

  const limite = regra.desvioKg;
  const acima = ultimas.every((s) => s.desvio > limite);
  const abaixo = ultimas.every((s) => s.desvio < -limite);
  const desvios = ultimas.map((s) => `${s.desvio > 0 ? "+" : ""}${s.desvio.toFixed(1).replace(".", ",")}`).join(" e ");

  if (acima) {
    return {
      codigo: "antecipar",
      texto: "Antecipe o próximo bloco",
      detalhe: `${regra.semanas} semanas seguidas acima do alvo, desvio de ${desvios} kg.`,
    };
  }
  if (abaixo) {
    return {
      codigo: "voltar",
      texto: "Volte um bloco",
      detalhe: `${regra.semanas} semanas seguidas abaixo do alvo, desvio de ${desvios} kg.`,
    };
  }
  return {
    codigo: "seguir",
    texto: "Siga o cronograma",
    detalhe: `Desvio de ${desvios} kg nas últimas ${regra.semanas} semanas.`,
  };
}
