import { z } from "zod";
import { CodModeloSchema } from "../data/schema.ts";

/**
 * O que o usuario produz, em oposicao ao plano, que e fixo.
 * Estes tipos atravessam tres fronteiras: localStorage, fila e Supabase.
 */

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data precisa ser YYYY-MM-DD");
const HORA = z.string().regex(/^\d{2}:\d{2}$/, "hora precisa ser HH:MM");

export const PesagemRegistradaSchema = z.object({
  data: ISO,
  peso: z.number().positive(),
  cintura: z.number().positive().nullable(),
  atualizadoEm: z.string(),
});

export const ItemRegistradoSchema = z.object({ n: z.string(), q: z.string() });

export const RefeicaoRegistradaSchema = z.object({
  id: z.string().min(1),
  data: ISO,
  hora: HORA,
  refeicao: z.string(),
  itens: z.array(ItemRegistradoSchema),
  p: z.number(),
  c: z.number(),
  g: z.number(),
  kcal: z.number(),
  criadoEm: z.string(),
});

export const DiaEscolhidoSchema = z.object({
  data: ISO,
  modelo: CodModeloSchema,
  atualizadoEm: z.string(),
});

export type PesagemRegistrada = z.infer<typeof PesagemRegistradaSchema>;
export type ItemRegistrado = z.infer<typeof ItemRegistradoSchema>;
export type RefeicaoRegistrada = z.infer<typeof RefeicaoRegistradaSchema>;
export type DiaEscolhido = z.infer<typeof DiaEscolhidoSchema>;

/** Tudo que o usuario produziu, do jeito que o app segura na memoria. */
export const InstantaneoSchema = z.object({
  pesagens: z.array(PesagemRegistradaSchema),
  refeicoes: z.array(RefeicaoRegistradaSchema),
  dias: z.array(DiaEscolhidoSchema),
});

export type Instantaneo = z.infer<typeof InstantaneoSchema>;

export function instantaneoVazio(): Instantaneo {
  return { pesagens: [], refeicoes: [], dias: [] };
}

/** Uma escrita pendente de subir. A fila e drenada em ordem. */
export const OperacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ id: z.string(), em: z.string(), tipo: z.literal("pesagem.salvar"), alvo: PesagemRegistradaSchema }),
  z.object({ id: z.string(), em: z.string(), tipo: z.literal("refeicao.salvar"), alvo: RefeicaoRegistradaSchema }),
  z.object({ id: z.string(), em: z.string(), tipo: z.literal("refeicao.apagar"), alvo: z.object({ id: z.string() }) }),
  z.object({ id: z.string(), em: z.string(), tipo: z.literal("dia.definir"), alvo: DiaEscolhidoSchema }),
]);

export type Operacao = z.infer<typeof OperacaoSchema>;

/** Estado que o cabecalho mostra. */
export type EstadoSync = "sem-login" | "sincronizado" | "pendente" | "sincronizando" | "erro";

/**
 * O contrato que o repositorio enxerga do servidor. Supabase e uma implementacao,
 * o dublê dos testes e outra. Nada acima desta linha sabe o que e PostgREST.
 */
export interface Servidor {
  puxar(): Promise<Instantaneo>;
  aplicar(op: Operacao): Promise<void>;
}

export function novoId(): string {
  return globalThis.crypto.randomUUID();
}

export function agoraISO(): string {
  return new Date().toISOString();
}
