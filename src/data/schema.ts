import { z } from "zod";

/**
 * Tipos e validacao do plano. Fonte de verdade: src/data/plano.json.
 * Nada aqui calcula nada. Calculo fica em src/core/.
 */

export const COD_BLOCOS = ["A", "B", "C", "D"] as const;
export const COD_MODELOS = ["t11", "t1630", "off", "fds"] as const;
export const CATEGORIAS = ["prot", "carb", "fruta", "gord", "outro", "livre"] as const;

export const CodBlocoSchema = z.enum(COD_BLOCOS);
export const CodModeloSchema = z.enum(COD_MODELOS);
export const CategoriaSchema = z.enum(CATEGORIAS);

/** [proteina, carboidrato, gordura, kcal] */
export const MacroSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** Por 100 g do alimento pronto: [prot, carb, gord, fibra, categoria, unidade] */
export const AlimentoSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  CategoriaSchema,
  z.enum(["g", "ml"]),
]);

export const ItemSchema = z.object({
  n: z.string().min(1),
  q: z.string().min(1),
});

export const RefeicaoSchema = z.object({
  h: z.string().regex(/^\d{2}:\d{2}$/),
  tag: z.string(),
  livre: z.boolean(),
  itens: z.array(ItemSchema),
  m: MacroSchema,
});

export const DiaModeloSchema = z.object({
  nome: z.string().min(1),
  desc: z.string(),
  tot: MacroSchema,
  refs: z.array(RefeicaoSchema).min(1),
});

export const BlocoSchema = z.object({
  cod: CodBlocoSchema,
  semanas: z.string(),
  periodo: z.string(),
  media: z.number(),
  peso: z.string(),
  resumo: z.string(),
  perda: z.string(),
});

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data precisa ser YYYY-MM-DD");

export const FaixaSchema = z.object({
  cod: CodBlocoSchema,
  inicio: ISO,
  fim: ISO,
});

export const PontoCurvaSchema = z.object({
  n: z.number().int().positive(),
  bloco: CodBlocoSchema,
  data: z.string(),
  iso: ISO,
  peso: z.number().positive(),
  cintura: z.number().positive(),
});

export const ItemCompraSchema = z.object({
  n: z.string(),
  q: z.string(),
  extra: z.string().nullable(),
  nota: z.string().nullable(),
});

export const ComprasSchema = z.object({
  periodo: z.string(),
  cats: z.array(z.object({ cat: z.string(), itens: z.array(ItemCompraSchema) })),
});

export const EmbalagemSchema = z.object({
  unidade: z.string().min(1),
  porcao: z.number().positive(),
  mostrar: z.enum(["unidades", "ambos"]),
  rotulo: z.string(),
});

export const MercadoSchema = z.object({
  secao: z.string().min(1),
  nome: z.string().min(1),
  nota: z.string().optional(),
  notaRendimento: z.enum(["rende", "casca"]).optional(),
  /** Unidade em que o item e vendido, quando difere da unidade do alimento pronto. */
  unidadeCompra: z.enum(["g", "ml"]).optional(),
});

export const SolverSchema = z.object({
  pesos: z.object({ p: z.number().positive(), c: z.number().positive(), g: z.number().positive() }),
  minimoG: z.number().positive(),
  minimoMl: z.number().positive(),
  passoG: z.number().positive(),
  passoMl: z.number().positive(),
  iteracoes: z.number().int().positive(),
  toleranciaG: z.number().positive(),
  /** Quantas fontes diferentes da mesma categoria podem entrar num prato. */
  maxPorCategoria: z.number().int().positive(),
  /** Fracao do alvo que a selecao precisa alcancar para o macro entrar na conta. */
  alcanceMinimo: z.number().positive(),
  /** Porcao maxima assumida para alimento sem teto proprio, so para medir alcance. */
  porcaoTeorica: z.number().positive(),
  avisos: z.object({
    protFalta: z.number().positive(),
    carbFalta: z.number().positive(),
    gordSobra: z.number().positive(),
    azeiteFalta: z.number().positive(),
  }),
});

export const ParametrosSchema = z.object({
  pesoInicial: z.number().positive(),
  faixaSemanal: z.tuple([z.number(), z.number()]),
  kcalPorKg: z.number().positive(),
  semanaPadrao: z.record(CodModeloSchema, z.number().int().nonnegative()),
  folgaCompras: z.number().min(0).max(1),
  rendimento: z.record(z.string(), z.number().positive()),
  livre: z.object({ kcalMax: z.number().positive(), protMin: z.number().nonnegative() }),
  autorregulacao: z.object({ desvioKg: z.number().positive(), semanas: z.number().int().positive() }),
  regressaoPontos: z.number().int().min(2),
  /** Quantidade padrao dos itens que entram fixos na calculadora. Chave: categoria ou nome do alimento. */
  porcoesFixas: z.record(z.string(), z.number().positive()),
  /** Teto por refeicao de alimentos que ninguem come em qualquer quantidade, como whey e azeite. */
  maximos: z.record(z.string(), z.number().positive()),
  solver: SolverSchema,
  secoes: z.array(z.string().min(1)).min(1),
  embalagens: z.record(z.string(), EmbalagemSchema),
  mercado: z.record(z.string(), MercadoSchema),
});

export const PlanoSchema = z.object({
  blocos: z.array(BlocoSchema).length(4),
  faixas: z.array(FaixaSchema).length(4),
  dias: z.record(CodBlocoSchema, z.record(CodModeloSchema, DiaModeloSchema)),
  alimentos: z.record(z.string(), AlimentoSchema),
  curva: z.array(PontoCurvaSchema).min(2),
  parametros: ParametrosSchema,
});

export type Macro = z.infer<typeof MacroSchema>;
export type CodBloco = z.infer<typeof CodBlocoSchema>;
export type CodModelo = z.infer<typeof CodModeloSchema>;
export type Categoria = z.infer<typeof CategoriaSchema>;
export type Alimento = z.infer<typeof AlimentoSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Refeicao = z.infer<typeof RefeicaoSchema>;
export type DiaModelo = z.infer<typeof DiaModeloSchema>;
export type Bloco = z.infer<typeof BlocoSchema>;
export type Faixa = z.infer<typeof FaixaSchema>;
export type PontoCurva = z.infer<typeof PontoCurvaSchema>;
export type ItemCompra = z.infer<typeof ItemCompraSchema>;
export type Compras = z.infer<typeof ComprasSchema>;
export type Embalagem = z.infer<typeof EmbalagemSchema>;
export type Mercado = z.infer<typeof MercadoSchema>;
export type Solver = z.infer<typeof SolverSchema>;
export type Parametros = z.infer<typeof ParametrosSchema>;
export type Plano = z.infer<typeof PlanoSchema>;

/** Indices dos macros dentro de Macro e de Alimento. */
export const P = 0;
export const C = 1;
export const G = 2;
export const KCAL = 3;
export const FIBRA = 3;
export const CAT = 4;
export const UNIDADE = 5;

/** Valida um objeto cru e devolve o Plano tipado. Lanca ZodError se estiver fora do contrato. */
export function validarPlano(cru: unknown): Plano {
  return PlanoSchema.parse(cru);
}
