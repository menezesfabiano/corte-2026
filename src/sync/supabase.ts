import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  DiaEscolhidoSchema,
  ItemRegistradoSchema,
  PesagemRegistradaSchema,
  RefeicaoRegistradaSchema,
  type Instantaneo,
  type Operacao,
  type Servidor,
} from "./tipos.ts";

/**
 * Ponte com o Supabase: login por magic link e as quatro escritas.
 *
 * A publishable key vai no bundle e isso e proposital. Ela nao da acesso a nada:
 * as tres tabelas tem RLS ligado e cada policy exige auth.uid() igual ao user_id.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CHAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

let cliente: SupabaseClient | null = null;

/** Ha credencial no build? Sem isso o app roda inteiro, so que local. */
export function configurado(): boolean {
  return Boolean(URL && CHAVE);
}

export function obterCliente(): SupabaseClient | null {
  if (!configurado()) return null;
  cliente ??= createClient(URL!, CHAVE!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cliente;
}

/** Manda o magic link. Sem senha, sem cadastro, so o e-mail. */
export async function entrar(email: string): Promise<void> {
  const c = obterCliente();
  if (!c) throw new Error("Supabase não configurado neste build.");
  const { error } = await c.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: globalThis.location?.href },
  });
  if (error) throw new Error(error.message);
}

export async function sair(): Promise<void> {
  const c = obterCliente();
  if (!c) return;
  await c.auth.signOut();
}

export async function sessaoAtual(): Promise<Session | null> {
  const c = obterCliente();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session;
}

/** Devolve a funcao que cancela a assinatura. */
export function aoMudarSessao(callback: (sessao: Session | null) => void): () => void {
  const c = obterCliente();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_evento, sessao) => callback(sessao));
  return () => data.subscription.unsubscribe();
}

// --------------------------------------------------------------- linhas

/** numeric do Postgres pode chegar como numero ou como string, dependendo do driver. */
const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v === null ? null : Number(v)));

const LinhaPesagem = z.object({
  data: z.string(),
  peso: numeroOuNulo,
  cintura: numeroOuNulo,
  atualizado_em: z.string(),
});

const LinhaRefeicao = z.object({
  id: z.string(),
  data: z.string(),
  hora: z.string(),
  refeicao: z.string(),
  itens: z.array(ItemRegistradoSchema).catch([]),
  p: numero,
  c: numero,
  g: numero,
  kcal: numero,
  criado_em: z.string(),
});

const LinhaDia = z.object({
  data: z.string(),
  modelo: z.string(),
  atualizado_em: z.string(),
});

export class ServidorSupabase implements Servidor {
  constructor(
    private readonly cliente: SupabaseClient,
    private readonly userId: string,
  ) {}

  async puxar(): Promise<Instantaneo> {
    const [pesagens, refeicoes, dias] = await Promise.all([
      this.cliente.from("corte_pesagens").select("data,peso,cintura,atualizado_em").eq("user_id", this.userId),
      this.cliente
        .from("corte_refeicoes")
        .select("id,data,hora,refeicao,itens,p,c,g,kcal,criado_em")
        .eq("user_id", this.userId),
      this.cliente.from("corte_dias").select("data,modelo,atualizado_em").eq("user_id", this.userId),
    ]);

    for (const r of [pesagens, refeicoes, dias]) {
      if (r.error) throw new Error(r.error.message);
    }

    return {
      // linha invalida e descartada em silencio: melhor um dado a menos que o app sem abrir
      pesagens: (pesagens.data ?? [])
        .map((l) => LinhaPesagem.safeParse(l))
        .flatMap((r) => (r.success && r.data.peso !== null ? [r.data] : []))
        .map((l) => ({ data: l.data, peso: l.peso!, cintura: l.cintura, atualizadoEm: l.atualizado_em }))
        .filter((p) => PesagemRegistradaSchema.safeParse(p).success),
      refeicoes: (refeicoes.data ?? [])
        .map((l) => LinhaRefeicao.safeParse(l))
        .flatMap((r) => (r.success ? [r.data] : []))
        .map((l) => ({
          id: l.id,
          data: l.data,
          hora: l.hora,
          refeicao: l.refeicao,
          itens: l.itens,
          p: l.p,
          c: l.c,
          g: l.g,
          kcal: l.kcal,
          criadoEm: l.criado_em,
        }))
        .filter((r) => RefeicaoRegistradaSchema.safeParse(r).success),
      dias: (dias.data ?? [])
        .map((l) => LinhaDia.safeParse(l))
        .flatMap((r) => (r.success ? [r.data] : []))
        .map((l) => ({ data: l.data, modelo: l.modelo, atualizadoEm: l.atualizado_em }))
        .flatMap((d) => {
          const ok = DiaEscolhidoSchema.safeParse(d);
          return ok.success ? [ok.data] : [];
        }),
    };
  }

  async aplicar(op: Operacao): Promise<void> {
    const u = this.userId;
    switch (op.tipo) {
      case "pesagem.salvar": {
        const { error } = await this.cliente
          .from("corte_pesagens")
          .upsert(
            { user_id: u, data: op.alvo.data, peso: op.alvo.peso, cintura: op.alvo.cintura },
            { onConflict: "user_id,data" },
          );
        if (error) throw new Error(error.message);
        return;
      }
      case "refeicao.salvar": {
        const { error } = await this.cliente.from("corte_refeicoes").upsert(
          {
            id: op.alvo.id,
            user_id: u,
            data: op.alvo.data,
            hora: op.alvo.hora,
            refeicao: op.alvo.refeicao,
            itens: op.alvo.itens,
            p: op.alvo.p,
            c: op.alvo.c,
            g: op.alvo.g,
            kcal: op.alvo.kcal,
          },
          { onConflict: "id" },
        );
        if (error) throw new Error(error.message);
        return;
      }
      case "refeicao.apagar": {
        const { error } = await this.cliente.from("corte_refeicoes").delete().eq("id", op.alvo.id).eq("user_id", u);
        if (error) throw new Error(error.message);
        return;
      }
      case "dia.definir": {
        const { error } = await this.cliente
          .from("corte_dias")
          .upsert({ user_id: u, data: op.alvo.data, modelo: op.alvo.modelo }, { onConflict: "user_id,data" });
        if (error) throw new Error(error.message);
        return;
      }
    }
  }
}
