import { esc, type Tela } from "./comum.ts";

/**
 * Tela Regras: o texto do protocolo, como pesar, regras do corte, quando mudar
 * de bloco, e as premissas. Conteudo vem de plano.json, nao e hardcoded aqui.
 */

/** Escapa o HTML e depois converte **negrito** em <b>. Nessa ordem, senao escapa o <b>. */
function comNegrito(texto: string): string {
  return esc(texto).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

export const telaRegras: Tela = {
  render(ctx) {
    const { regras, fontes } = ctx.plano;
    return `
      <div class="rules">
        ${regras
          .map(
            (r) => `<div><h3>${esc(r.titulo)}</h3><ul>${r.itens
              .map((i) => `<li>${comNegrito(i)}</li>`)
              .join("")}</ul></div>`,
          )
          .join("")}
      </div>
      <p class="fonte"><b>Premissas e fontes.</b> ${esc(fontes)}</p>
    `;
  },

  ligar() {
    // so leitura
  },
};
