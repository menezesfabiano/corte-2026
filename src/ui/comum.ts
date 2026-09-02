import type { Plano } from "../data/schema.ts";
import type { Repositorio } from "../sync/repositorio.ts";

/** O que toda tela precisa. Nenhuma tela calcula nada: elas so pedem para src/core/. */
export interface Contexto {
  plano: Plano;
  repo: Repositorio;
  /** Data local em Sao Paulo, lida na hora, nunca guardada. */
  hoje(): string;
  redesenhar(): void;
}

export interface Tela {
  render(ctx: Contexto): string;
  ligar(ctx: Contexto, raiz: HTMLElement): void;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Nome de alimento vem de dado, entao nunca entra cru no HTML. */
export function esc(valor: unknown): string {
  return String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Numero com virgula decimal, do jeito daqui. */
export function nf(x: number, casas = 0): string {
  return x.toFixed(casas).replace(".", ",");
}

/** Arredonda para inteiro e formata. Usado em macro e kcal na tela. */
export function inteiro(x: number): string {
  return String(Math.round(x));
}

export function sinal(x: number, casas = 1): string {
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${nf(Math.abs(x), casas)}`;
}

export function $<T extends Element>(raiz: ParentNode, seletor: string): T | null {
  return raiz.querySelector<T>(seletor);
}

export function $$<T extends Element>(raiz: ParentNode, seletor: string): T[] {
  return [...raiz.querySelectorAll<T>(seletor)];
}

/** Le um campo numerico aceitando virgula. Vazio vira null. */
export function lerNumero(entrada: HTMLInputElement | null): number | null {
  if (!entrada) return null;
  const bruto = entrada.value.trim().replace(",", ".");
  if (bruto === "") return null;
  const valor = Number(bruto);
  return Number.isFinite(valor) ? valor : null;
}

export const NOMES_MODELO: Record<string, string> = {
  t11: "Treino 11h",
  t1630: "Treino 16h30",
  off: "Sem treino",
  fds: "Fim de semana",
};

export const NOMES_CATEGORIA: Record<string, string> = {
  prot: "Proteína",
  carb: "Carboidrato",
  fruta: "Fruta",
  gord: "Gordura",
  outro: "Leite",
  livre: "Volume livre",
};
