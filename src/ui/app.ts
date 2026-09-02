import { blocoDe, dataComDia, hojeISO } from "../core/calendario.ts";
import { mediaSemanal } from "../core/macros.ts";
import { plano } from "../data/plano.ts";
import { Repositorio } from "../sync/repositorio.ts";
import { ServidorSupabase, aoMudarSessao, configurado, entrar, obterCliente, sair, sessaoAtual } from "../sync/supabase.ts";
import { $, $$, esc, type Contexto, type Tela } from "./comum.ts";
import { telaHoje } from "./hoje.ts";
import { telaCalcular } from "./calcular.ts";
import { telaPeso } from "./peso.ts";
import { telaCompras } from "./compras.ts";
import { telaRegras } from "./regras.ts";

/** Casca do app: cabecalho, abas e conta. Nenhuma conta de macro passa por aqui. */

const TELAS: Record<string, Tela> = {
  hoje: telaHoje,
  calc: telaCalcular,
  peso: telaPeso,
  compras: telaCompras,
  regras: telaRegras,
};

let abaAtual = "hoje";
let painelConta = false;
let recado = "";

const repo = new Repositorio();

const ctx: Contexto = {
  plano,
  repo,
  hoje: () => hojeISO(),
  redesenhar: () => desenhar(),
};

function textoSync(): { classe: string; texto: string } {
  const estado = repo.estado();
  if (estado === "sem-login") return { classe: "", texto: "salvo só neste aparelho" };
  if (estado === "sincronizado") return { classe: "on", texto: "sincronizado" };
  if (estado === "sincronizando") return { classe: "off", texto: "sincronizando" };
  if (estado === "pendente") {
    const n = repo.pendentes();
    return { classe: "off", texto: `${n} ${n === 1 ? "mudança pendente" : "mudanças pendentes"}` };
  }
  return { classe: "off", texto: `erro ao sincronizar: ${repo.ultimoErro() ?? "sem detalhe"}` };
}

function desenharCabecalho(): void {
  const hoje = ctx.hoje();
  const bloco = blocoDe(hoje, plano.faixas);
  const media = mediaSemanal(plano.alimentos, plano.dias[bloco]!, plano.parametros.semanaPadrao);

  const chipBloco = $(document, "#chip-bloco");
  if (chipBloco) chipBloco.textContent = `Bloco ${bloco}`;
  const chipKcal = $(document, "#chip-kcal");
  if (chipKcal) chipKcal.textContent = `${Math.round(media)} kcal`;

  const { classe, texto } = textoSync();
  const ponto = $(document, "#sync-dot");
  if (ponto) ponto.className = `dot ${classe}`;
  const rotulo = $(document, "#sync-txt");
  if (rotulo) rotulo.textContent = `${dataComDia(hoje)} · ${texto}`;

  const botao = $<HTMLButtonElement>(document, "#btn-conta");
  const temSessao = Boolean(sessaoAberta);
  if (botao) {
    botao.hidden = !configurado();
    botao.textContent = temSessao ? "Sair" : "Entrar";
  }

  const painel = $<HTMLElement>(document, "#painel-conta");
  if (painel) {
    painel.hidden = !painelConta;
    painel.innerHTML = painelConta
      ? `<div class="grid2" style="margin-top:10px">
           <div style="grid-column:1 / -1"><label for="in-email">E-mail para o link de acesso</label>
             <input id="in-email" type="email" inputmode="email" autocomplete="email" placeholder="voce@exemplo.com"></div>
         </div>
         <div class="row"><button class="btn pri" id="enviar-link">Enviar link</button>
           <button class="btn" id="fechar-conta">Cancelar</button></div>
         ${recado ? `<div class="msg">${esc(recado)}</div>` : ""}`
      : "";
    if (painelConta) ligarPainelConta();
  }
}

function ligarPainelConta(): void {
  $(document, "#fechar-conta")?.addEventListener("click", () => {
    painelConta = false;
    recado = "";
    desenharCabecalho();
  });
  $(document, "#enviar-link")?.addEventListener("click", async () => {
    const campo = $<HTMLInputElement>(document, "#in-email");
    const email = campo?.value.trim() ?? "";
    if (!email) return;
    try {
      await entrar(email);
      recado = `Link enviado para ${email}. Abra o e-mail neste aparelho.`;
    } catch (erro) {
      recado = `Não deu para enviar: ${erro instanceof Error ? erro.message : String(erro)}`;
    }
    desenharCabecalho();
  });
}

function desenhar(): void {
  const rolagem = globalThis.scrollY;
  desenharCabecalho();

  for (const secao of $$<HTMLElement>(document, "main section")) {
    const nome = secao.dataset.tela!;
    const ativa = nome === abaAtual;
    secao.hidden = !ativa;
    if (!ativa) {
      secao.innerHTML = "";
      continue;
    }
    const tela = TELAS[nome]!;
    secao.innerHTML = tela.render(ctx);
    tela.ligar(ctx, secao);
  }

  for (const botao of $$<HTMLButtonElement>(document, "nav button")) {
    botao.setAttribute("aria-current", botao.dataset.t === abaAtual ? "page" : "false");
  }
  globalThis.scrollTo({ top: rolagem });
}

function irPara(aba: string): void {
  if (!TELAS[aba]) return;
  abaAtual = aba;
  globalThis.scrollTo({ top: 0 });
  desenhar();
}

let sessaoAberta: string | null = null;

async function conectarSeTiverSessao(): Promise<void> {
  if (!configurado()) return;
  const sessao = await sessaoAtual();
  const cliente = obterCliente();
  if (sessao?.user && cliente) {
    sessaoAberta = sessao.user.id;
    await repo.conectar(new ServidorSupabase(cliente, sessao.user.id));
  } else {
    sessaoAberta = null;
    repo.desconectar();
  }
  desenhar();
}

export function iniciar(): void {
  repo.assinar(() => desenharCabecalho());

  for (const botao of $$<HTMLButtonElement>(document, "nav button")) {
    botao.addEventListener("click", () => irPara(botao.dataset.t!));
  }

  $(document, "#btn-conta")?.addEventListener("click", async () => {
    if (sessaoAberta) {
      await sair();
      sessaoAberta = null;
      repo.desconectar();
      desenhar();
      return;
    }
    painelConta = !painelConta;
    recado = "";
    desenharCabecalho();
  });

  // volta a subir a fila assim que a rede reaparece ou o app volta para a tela
  globalThis.addEventListener("online", () => void repo.sincronizar());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void repo.sincronizar();
  });

  desenhar();

  aoMudarSessao(() => void conectarSeTiverSessao());
  void conectarSeTiverSessao();
}
