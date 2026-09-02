import type { CodModelo } from "../data/schema.ts";
import { CacheLocal, fundir } from "./local.ts";
import {
  agoraISO,
  novoId,
  type DiaEscolhido,
  type EstadoSync,
  type ItemRegistrado,
  type Operacao,
  type PesagemRegistrada,
  type RefeicaoRegistrada,
  type Servidor,
} from "./tipos.ts";

/**
 * Orquestracao offline-first. A UI so fala com esta classe.
 *
 * Toda escrita cai primeiro no cache local e so depois entra numa fila que sobe
 * quando ha rede e sessao. Sem sessao o app funciona inteiro, com os dados so
 * neste aparelho.
 */

export interface EntradaRefeicao {
  data: string;
  hora: string;
  refeicao: string;
  itens: readonly ItemRegistrado[];
  p: number;
  c: number;
  g: number;
  kcal: number;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export class Repositorio {
  private servidor: Servidor | null = null;
  private erro: string | null = null;
  private ocupado = false;
  private emAndamento: Promise<void> | null = null;
  private readonly ouvintes = new Set<() => void>();

  constructor(
    private readonly cache: CacheLocal = new CacheLocal(),
    private readonly relogio: () => string = agoraISO,
    private readonly gerarId: () => string = novoId,
  ) {}

  // ------------------------------------------------------------- estado

  assinar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => void this.ouvintes.delete(ouvinte);
  }

  private avisar(): void {
    for (const o of this.ouvintes) o();
  }

  estado(): EstadoSync {
    if (!this.servidor) return "sem-login";
    if (this.ocupado) return "sincronizando";
    if (this.erro) return "erro";
    return this.cache.fila().length > 0 ? "pendente" : "sincronizado";
  }

  ultimoErro(): string | null {
    return this.erro;
  }

  pendentes(): number {
    return this.cache.fila().length;
  }

  // ------------------------------------------------------------ leitura

  pesagens(): PesagemRegistrada[] {
    return this.cache.pesagens();
  }

  refeicoesDe(data: string): RefeicaoRegistrada[] {
    return this.cache.refeicoesDe(data);
  }

  modeloDe(data: string): CodModelo | null {
    return this.cache.modeloDe(data);
  }

  // ------------------------------------------------------------ escrita

  salvarPesagem(data: string, peso: number, cintura: number | null): PesagemRegistrada {
    const alvo: PesagemRegistrada = { data, peso, cintura, atualizadoEm: this.relogio() };
    this.cache.salvarPesagem(alvo);
    this.enfileirar({ tipo: "pesagem.salvar", alvo });
    return alvo;
  }

  registrarRefeicao(entrada: EntradaRefeicao): RefeicaoRegistrada {
    const alvo: RefeicaoRegistrada = {
      id: this.gerarId(),
      data: entrada.data,
      hora: entrada.hora,
      refeicao: entrada.refeicao,
      itens: [...entrada.itens],
      p: entrada.p,
      c: entrada.c,
      g: entrada.g,
      kcal: entrada.kcal,
      criadoEm: this.relogio(),
    };
    this.cache.salvarRefeicao(alvo);
    this.enfileirar({ tipo: "refeicao.salvar", alvo });
    return alvo;
  }

  /** Funciona offline porque o id foi gerado aqui, nao pelo servidor. */
  apagarRefeicao(id: string): void {
    this.cache.apagarRefeicao(id);
    this.enfileirar({ tipo: "refeicao.apagar", alvo: { id } });
  }

  definirModelo(data: string, modelo: CodModelo): DiaEscolhido {
    const alvo: DiaEscolhido = { data, modelo, atualizadoEm: this.relogio() };
    this.cache.definirModelo(alvo);
    this.enfileirar({ tipo: "dia.definir", alvo });
    return alvo;
  }

  private enfileirar(parcial: Omit<Operacao, "id" | "em">): void {
    this.cache.enfileirar({ id: this.gerarId(), em: this.relogio(), ...parcial } as Operacao);
    this.avisar();
    void this.sincronizar().catch(() => {});
  }

  // ------------------------------------------------------ sincronizacao

  /** Entra em modo conectado: puxa do servidor, funde com o que nao subiu e drena a fila. */
  async conectar(servidor: Servidor): Promise<void> {
    this.servidor = servidor;
    this.erro = null;
    this.ocupado = true;
    this.avisar();
    try {
      const remoto = await servidor.puxar();
      this.cache.substituir(fundir(remoto, this.cache.fila()));
    } catch (erro) {
      this.erro = mensagemDe(erro);
      this.ocupado = false;
      this.avisar();
      return;
    }
    this.ocupado = false;
    this.avisar();
    await this.sincronizar();
  }

  /** Sai do modo conectado. Os dados continuam aqui, salvos so neste aparelho. */
  desconectar(): void {
    this.servidor = null;
    this.erro = null;
    this.avisar();
  }

  /** Sobe a fila. Chamadas concorrentes compartilham a mesma drenagem. */
  async sincronizar(): Promise<void> {
    if (this.emAndamento) return this.emAndamento;
    this.emAndamento = this.drenar().finally(() => {
      this.emAndamento = null;
    });
    return this.emAndamento;
  }

  private async drenar(): Promise<void> {
    if (!this.servidor || this.cache.fila().length === 0) return;
    this.ocupado = true;
    this.erro = null;
    this.avisar();

    // uma operacao por vez, removendo so a que subiu: falha no meio nao perde o resto
    let fila = this.cache.fila();
    while (fila.length > 0) {
      const op = fila[0]!;
      try {
        await this.servidor.aplicar(op);
      } catch (erro) {
        this.erro = mensagemDe(erro);
        break;
      }
      this.cache.removerDaFila([op.id]);
      fila = this.cache.fila();
    }

    this.ocupado = false;
    this.avisar();
  }
}
