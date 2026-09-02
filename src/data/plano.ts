import cru from "./plano.json";
import { validarPlano, type Plano } from "./schema.ts";

/**
 * Instancia unica do plano, ja validada. Se plano.json sair do contrato,
 * o app quebra aqui, no boot, e nao com um NaN na tela.
 */
export const plano: Plano = validarPlano(cru);
export const parametros = plano.parametros;
export const alimentos = plano.alimentos;
