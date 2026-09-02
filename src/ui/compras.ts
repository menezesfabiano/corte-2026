import { blocoDe } from "../core/calendario.ts";
import { listaDeCompras } from "../core/compras.ts";
import { esc, type Tela } from "./comum.ts";

/**
 * Tela Compras: a lista da semana do bloco corrente, derivada do plano.
 * Nada aqui e digitado a mao, tudo vem de src/core/compras.ts.
 */
export const telaCompras: Tela = {
  render(ctx) {
    const bloco = blocoDe(ctx.hoje(), ctx.plano.faixas);
    const lista = listaDeCompras(ctx.plano, bloco);
    const folga = Math.round(ctx.plano.parametros.folgaCompras * 100);

    return `
      <p class="lead">Sete dias do bloco ${lista.bloco}, ${esc(lista.periodo)}. Quantidade a <b>comprar</b>,
      já com ${folga}% de folga. Você nunca pesa isto: pese sempre depois de pronto.</p>
      <div class="grid-cartoes">
      ${lista.secoes
        .map(
          (secao) => `<div class="card">
            <div class="crow"><span class="ctag">${esc(secao.secao)}</span></div>
            ${secao.itens
              .map((item) => {
                const detalhe = [item.extra, item.nota].filter(Boolean).join(" · ");
                return `<div class="citem">
                  <span>${esc(item.nome)}${
                    detalhe ? `<br><small style="color:var(--mut);font-size:11.5px">${esc(detalhe)}</small>` : ""
                  }</span>
                  <b>${esc(item.texto)}</b>
                </div>`;
              })
              .join("")}
          </div>`,
        )
        .join("")}
      </div>
    `;
  },

  ligar() {
    // lista de leitura, sem interacao
  },
};
