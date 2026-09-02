import type { CodBloco, CodModelo, Faixa, PontoCurva } from "../data/schema.ts";

/**
 * Data e calendario, sempre no fuso de Sao Paulo.
 *
 * Regra da casa: nunca use new Date().toISOString().slice(0,10) para saber que dia e hoje.
 * Isso devolve UTC, e das 21h as 23h59 em Sao Paulo o app acharia que ja e amanha.
 */
export const FUSO = "America/Sao_Paulo";

const FORMATO_ISO = new Intl.DateTimeFormat("sv-SE", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data local em Sao Paulo no formato YYYY-MM-DD. */
export function hojeISO(agora: Date = new Date()): string {
  return FORMATO_ISO.format(agora);
}

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Quebra YYYY-MM-DD em numeros. Lanca se o formato estiver errado. */
export function partesISO(iso: string): { ano: number; mes: number; dia: number } {
  const m = RE_ISO.exec(iso);
  if (!m) throw new Error(`data invalida: ${iso}`);
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function ehISO(valor: string): boolean {
  return RE_ISO.test(valor);
}

/** Numero de dias desde a epoca, contado no calendario civil, sem fuso nenhum no meio. */
function serial(iso: string): number {
  const { ano, mes, dia } = partesISO(iso);
  return Date.UTC(ano, mes - 1, dia) / 86400000;
}

function deSerial(n: number): string {
  const d = new Date(n * 86400000);
  const ano = String(d.getUTCFullYear()).padStart(4, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Soma dias a uma data ISO. */
export function somarDias(iso: string, dias: number): string {
  return deSerial(serial(iso) + dias);
}

/** Diferenca em dias entre duas datas ISO (b menos a). */
export function diasEntre(a: string, b: string): number {
  return serial(b) - serial(a);
}

/** 0 domingo, 1 segunda, ... 6 sabado. Calculado no calendario civil, sem fuso. */
export function diaDaSemana(iso: string): number {
  const { ano, mes, dia } = partesISO(iso);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function ehFimDeSemana(iso: string): boolean {
  const d = diaDaSemana(iso);
  return d === 0 || d === 6;
}

/** Segunda-feira da semana da data. Semana comeca na segunda. */
export function segundaDe(iso: string): string {
  const d = diaDaSemana(iso);
  return somarDias(iso, -((d + 6) % 7));
}

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

/** "24/08" */
export function dataCurta(iso: string): string {
  const { mes, dia } = partesISO(iso);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** "seg 24/08" */
export function dataComDia(iso: string): string {
  return `${DIAS_CURTOS[diaDaSemana(iso)]} ${dataCurta(iso)}`;
}

/** Bloco vigente na data. Antes do inicio devolve o primeiro, depois do fim devolve o ultimo. */
export function blocoDe(iso: string, faixas: readonly Faixa[]): CodBloco {
  const primeira = faixas[0];
  const ultima = faixas[faixas.length - 1];
  if (!primeira || !ultima) throw new Error("plano sem faixas de bloco");
  if (iso < primeira.inicio) return primeira.cod;
  for (const f of faixas) {
    if (iso >= f.inicio && iso <= f.fim) return f.cod;
  }
  return ultima.cod;
}

/**
 * Modelo de dia. Sabado e domingo sao sempre fds. Em dia util vale a escolha
 * salva pelo usuario, e na falta dela o padrao t11.
 */
export function modeloDe(iso: string, override?: CodModelo | null): CodModelo {
  if (ehFimDeSemana(iso)) return "fds";
  return override ?? "t11";
}

/** Ponto da curva cuja segunda-feira e a mais recente ate a data. Null antes da semana 1. */
export function semanaDe(iso: string, curva: readonly PontoCurva[]): PontoCurva | null {
  let achado: PontoCurva | null = null;
  for (const p of curva) {
    if (p.iso <= iso && (!achado || p.iso > achado.iso)) achado = p;
  }
  return achado;
}

/** Ponto da curva de uma data exata de pesagem, se existir. */
export function pontoDaCurva(iso: string, curva: readonly PontoCurva[]): PontoCurva | null {
  return curva.find((p) => p.iso === iso) ?? null;
}
