import type { Parametros, PontoCurva } from "../data/schema.ts";
import { diasEntre, semanaDe } from "./calendario.ts";

/**
 * Peso: ritmo real, projecao e leitura do ritmo.
 *
 * A medida e sempre a media dos 7 dias anteriores, informada na segunda-feira.
 * Aqui dentro nao existe peso de um dia so, existe ponto de semana.
 *
 * O tempo e sempre real, em semanas contadas a partir da partida do plano
 * (parametros.partida.iso, com parametros.pesoInicial). A partida e o fechamento
 * nao precisam cair numa segunda, entao o numero da semana nao serve de relogio.
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
  /** Segunda-feira da semana na curva. E a data que vale como relogio. */
  iso: string;
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
  /** Quantos pontos entraram na regressao, contando a partida quando ela entra. */
  pontos: number;
}

/** Ponto no tempo real: semanas desde a partida e peso. */
export interface PontoReal {
  t: number;
  peso: number;
}

export type CodigoAcao = "parado" | "rapido" | "abaixo" | "seguir" | "parcial" | "aguardar";

export interface Acao {
  codigo: CodigoAcao;
  texto: string;
  detalhe: string;
  /** A tela pinta de alerta quando e verdadeiro. */
  alerta: boolean;
}

export interface ResumoPlano {
  /** kg entre o peso inicial e o peso do fechamento. */
  perda: number;
  /** Semanas reais entre a partida e o fechamento. */
  semanas: number;
  /** kg por semana que a curva pede. */
  ritmo: number;
}

/** Semanas reais entre duas datas ISO. */
export function semanasReais(deISO: string, ateISO: string): number {
  return diasEntre(deISO, ateISO) / 7;
}

/** Perda, duracao e ritmo que o plano pede, da partida ao fechamento. */
export function resumoPlano(parametros: Parametros): ResumoPlano {
  const perda = parametros.pesoInicial - parametros.fechamento.peso;
  const semanas = semanasReais(parametros.partida.iso, parametros.fechamento.iso);
  return { perda, semanas, ritmo: perda / semanas };
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
      iso: ponto.iso,
      data: p.data,
      peso: p.peso,
      cintura: p.cintura,
      alvo: ponto.peso,
      desvio: p.peso - ponto.peso,
    });
  }
  return [...porSemana.values()].sort((a, b) => a.n - b.n);
}

/** A partida do plano seguida das semanas pesadas, no tempo real. */
export function pontosReais(semanas: readonly SemanaPesada[], parametros: Parametros): PontoReal[] {
  const partida = parametros.partida.iso;
  return [
    { t: 0, peso: parametros.pesoInicial },
    ...semanas.map((s) => ({ t: semanasReais(partida, s.iso), peso: s.peso })),
  ];
}

/**
 * Regressao linear de peso sobre o tempo real, nos ultimos pontos, com a partida
 * contando como ponto. Devolve a inclinacao em kg por semana e o R2. Sem pesagem,
 * ou com menos de parametros.ritmo.janelaMinDias entre o primeiro e o ultimo
 * ponto usados, nao ha ritmo: dois dias de diferenca viram qualquer numero.
 */
export function ritmo(semanas: readonly SemanaPesada[], parametros: Parametros): Ritmo | null {
  if (semanas.length === 0) return null;
  const usados = pontosReais(semanas, parametros).slice(-parametros.regressaoPontos);
  const n = usados.length;
  const primeiro = usados[0]!;
  const ultimo = usados[n - 1]!;
  if (n < 2 || (ultimo.t - primeiro.t) * 7 < parametros.ritmo.janelaMinDias) return null;

  const mediaX = usados.reduce((s, p) => s + p.t, 0) / n;
  const mediaY = usados.reduce((s, p) => s + p.peso, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of usados) {
    const dx = p.t - mediaX;
    const dy = p.peso - mediaY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  const inclinacao = sxy / sxx;
  let residuo = 0;
  for (const p of usados) {
    const previsto = mediaY + inclinacao * (p.t - mediaX);
    residuo += (p.peso - previsto) ** 2;
  }
  const r2 = syy === 0 ? 1 : Math.max(0, 1 - residuo / syy);
  return { inclinacao, r2, pontos: n };
}

/** Onde o peso chega na data de fechamento se o ritmo atual continuar. */
export function projecao(
  semanas: readonly SemanaPesada[],
  r: Ritmo | null,
  parametros: Parametros,
): number | null {
  const ultimo = semanas[semanas.length - 1];
  if (!ultimo || !r) return null;
  const restante = Math.max(0, semanasReais(ultimo.iso, parametros.fechamento.iso));
  return ultimo.peso + r.inclinacao * restante;
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
 * Ritmo de cada intervalo entre pontos consecutivos, em kg por semana, da partida
 * em diante. Intervalo mais curto que parametros.ritmo.intervaloMinDias e pulado
 * e o ponto seguinte passa a ser medido contra o mesmo ponto anterior.
 */
export function ritmosPorIntervalo(semanas: readonly SemanaPesada[], parametros: Parametros): number[] {
  const pontos = pontosReais(semanas, parametros);
  const minimo = parametros.ritmo.intervaloMinDias / 7;
  const saida: number[] = [];
  let anterior = pontos[0]!;
  for (const p of pontos.slice(1)) {
    const dt = p.t - anterior.t;
    if (dt < minimo) continue;
    saida.push((p.peso - anterior.peso) / dt);
    anterior = p;
  }
  return saida;
}

function kgPorSemana(x: number): string {
  const sinal = x > 0 ? "+" : x < 0 ? "−" : "";
  return `${sinal}${Math.abs(x).toFixed(2).replace(".", ",")}`;
}

/**
 * Leitura do ritmo. Olha os dois ultimos intervalos medidos, nunca o desvio
 * contra o alvo: quem esta acima da curva mas perdendo no ritmo certo nao esta
 * parado. O desvio continua na tela como informacao.
 */
export function acao(semanas: readonly SemanaPesada[], parametros: Parametros): Acao {
  const regra = parametros.ritmo;
  const ritmos = ritmosPorIntervalo(semanas, parametros);

  if (ritmos.length === 0) {
    return {
      codigo: "aguardar",
      texto: "Registre duas semanas",
      detalhe: "Ainda não há intervalo medido entre pesagens.",
      alerta: false,
    };
  }

  if (ritmos.length === 1) {
    const unico = ritmos[0]!;
    return {
      codigo: "parcial",
      texto: unico <= -regra.minimoKg ? "No ritmo, 1 semana medida" : "Abaixo do ritmo, 1 semana medida",
      detalhe: `${kgPorSemana(unico)} kg por semana no único intervalo medido. A leitura pede dois.`,
      alerta: false,
    };
  }

  const a = ritmos[ritmos.length - 2]!;
  const b = ritmos[ritmos.length - 1]!;
  const detalhe = `${kgPorSemana(a)} e ${kgPorSemana(b)} kg por semana nos dois últimos intervalos.`;

  if (a > -regra.paradoKg && b > -regra.paradoKg) {
    return { codigo: "parado", texto: "Parado há 2 semanas: fale com o coach", detalhe, alerta: true };
  }
  if (a < -regra.rapidoKg && b < -regra.rapidoKg) {
    return { codigo: "rapido", texto: "Rápido demais: volte ao cardápio B", detalhe, alerta: true };
  }
  if ((a + b) / 2 > -regra.minimoKg) {
    return { codigo: "abaixo", texto: "Abaixo do ritmo: confira doce e caminhada", detalhe, alerta: true };
  }
  return { codigo: "seguir", texto: "Siga o cronograma", detalhe, alerta: false };
}
