import type { CodModelo } from "../data/schema.ts";
import {
  InstantaneoSchema,
  OperacaoSchema,
  instantaneoVazio,
  type DiaEscolhido,
  type Instantaneo,
  type Operacao,
  type PesagemRegistrada,
  type RefeicaoRegistrada,
} from "./tipos.ts";
import { z } from "zod";

/**
 * Cache local e fila de sincronizacao.
 *
 * Escolha de armazenamento: localStorage, nao IndexedDB. O protocolo inteiro
 * cabe em 130 semanas de nada: 19 pesagens, cerca de 650 refeicoes de 200 bytes
 * e 130 escolhas de dia, algo perto de 150 kB no pior caso, contra um limite de
 * 5 MB. IndexedDB traria API assincrona e ceremonia de versao para resolver um
 * problema que nao existe neste tamanho.
 *
 * Toda leitura passa por zod. Cache corrompido vira cache vazio, nunca excecao
 * na tela: o app precisa abrir mesmo quando o que estava salvo virou lixo.
 */

export interface Armazem {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

export const PREFIXO = "corte2026:";
export const CHAVE_DADOS = `${PREFIXO}dados`;
export const CHAVE_FILA = `${PREFIXO}fila`;

/** Armazem de memoria, usado nos testes e quando o navegador bloqueia o storage. */
export function armazemMemoria(inicial: Record<string, string> = {}): Armazem {
  const mapa = new Map(Object.entries(inicial));
  return {
    getItem: (c) => mapa.get(c) ?? null,
    setItem: (c, v) => void mapa.set(c, v),
    removeItem: (c) => void mapa.delete(c),
  };
}

/** localStorage quando existe e responde. Modo privado e cota cheia caem na memoria. */
export function armazemPadrao(): Armazem {
  try {
    const teste = `${PREFIXO}teste`;
    globalThis.localStorage.setItem(teste, "1");
    globalThis.localStorage.removeItem(teste);
    return globalThis.localStorage;
  } catch {
    return armazemMemoria();
  }
}

const FilaSchema = z.array(OperacaoSchema);

export class CacheLocal {
  private dados: Instantaneo;
  private pendentes: Operacao[];

  constructor(private readonly armazem: Armazem = armazemPadrao()) {
    this.dados = this.lerJson(CHAVE_DADOS, InstantaneoSchema, instantaneoVazio());
    this.pendentes = this.lerJson(CHAVE_FILA, FilaSchema, []);
  }

  private lerJson<T>(chave: string, schema: z.ZodType<T>, vazio: T): T {
    const cru = this.armazem.getItem(chave);
    if (!cru) return vazio;
    try {
      const analisado = schema.safeParse(JSON.parse(cru));
      if (analisado.success) return analisado.data;
    } catch {
      // JSON quebrado cai no mesmo lugar que schema invalido
    }
    this.armazem.removeItem(chave);
    return vazio;
  }

  private gravar(chave: string, valor: unknown): void {
    try {
      this.armazem.setItem(chave, JSON.stringify(valor));
    } catch {
      // cota cheia ou storage bloqueado: a memoria continua correta e a fila sobe depois
    }
  }

  private salvarDados(): void {
    this.gravar(CHAVE_DADOS, this.dados);
  }

  private salvarFila(): void {
    this.gravar(CHAVE_FILA, this.pendentes);
  }

  // ------------------------------------------------------------- leitura

  instantaneo(): Instantaneo {
    return this.dados;
  }

  pesagens(): PesagemRegistrada[] {
    return [...this.dados.pesagens].sort((a, b) => a.data.localeCompare(b.data));
  }

  refeicoesDe(data: string): RefeicaoRegistrada[] {
    return this.dados.refeicoes
      .filter((r) => r.data === data)
      .sort((a, b) => a.hora.localeCompare(b.hora) || a.criadoEm.localeCompare(b.criadoEm));
  }

  modeloDe(data: string): CodModelo | null {
    return this.dados.dias.find((d) => d.data === data)?.modelo ?? null;
  }

  // ------------------------------------------------------------- escrita

  /** Substitui tudo, usado depois do pull. */
  substituir(dados: Instantaneo): void {
    this.dados = dados;
    this.salvarDados();
  }

  salvarPesagem(p: PesagemRegistrada): void {
    const outras = this.dados.pesagens.filter((x) => x.data !== p.data);
    this.dados = { ...this.dados, pesagens: [...outras, p] };
    this.salvarDados();
  }

  salvarRefeicao(r: RefeicaoRegistrada): void {
    const outras = this.dados.refeicoes.filter((x) => x.id !== r.id);
    this.dados = { ...this.dados, refeicoes: [...outras, r] };
    this.salvarDados();
  }

  apagarRefeicao(id: string): void {
    this.dados = { ...this.dados, refeicoes: this.dados.refeicoes.filter((x) => x.id !== id) };
    this.salvarDados();
  }

  definirModelo(d: DiaEscolhido): void {
    const outros = this.dados.dias.filter((x) => x.data !== d.data);
    this.dados = { ...this.dados, dias: [...outros, d] };
    this.salvarDados();
  }

  // ---------------------------------------------------------------- fila

  fila(): Operacao[] {
    return [...this.pendentes];
  }

  enfileirar(op: Operacao): void {
    this.pendentes = [...this.pendentes, op];
    this.salvarFila();
  }

  removerDaFila(ids: readonly string[]): void {
    const fora = new Set(ids);
    this.pendentes = this.pendentes.filter((o) => !fora.has(o.id));
    this.salvarFila();
  }

  limparFila(): void {
    this.pendentes = [];
    this.salvarFila();
  }

  limparTudo(): void {
    this.dados = instantaneoVazio();
    this.pendentes = [];
    this.armazem.removeItem(CHAVE_DADOS);
    this.armazem.removeItem(CHAVE_FILA);
  }
}

/** Aplica uma operacao sobre um instantaneo, sem tocar em disco. Usado na fusao pos pull. */
export function aplicarOperacao(dados: Instantaneo, op: Operacao): Instantaneo {
  switch (op.tipo) {
    case "pesagem.salvar":
      return { ...dados, pesagens: [...dados.pesagens.filter((p) => p.data !== op.alvo.data), op.alvo] };
    case "refeicao.salvar":
      return { ...dados, refeicoes: [...dados.refeicoes.filter((r) => r.id !== op.alvo.id), op.alvo] };
    case "refeicao.apagar":
      return { ...dados, refeicoes: dados.refeicoes.filter((r) => r.id !== op.alvo.id) };
    case "dia.definir":
      return { ...dados, dias: [...dados.dias.filter((d) => d.data !== op.alvo.data), op.alvo] };
  }
}

/**
 * Funde o que veio do servidor com o que ainda nao subiu.
 *
 * O remoto e a base. Cada operacao pendente e, por construcao, mais nova que
 * qualquer coisa que o servidor tenha, entao ela e reaplicada por cima.
 * Refeicao nao conflita porque o id vem do cliente.
 */
export function fundir(remoto: Instantaneo, fila: readonly Operacao[]): Instantaneo {
  return fila.reduce(aplicarOperacao, remoto);
}
