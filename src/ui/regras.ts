import { esc, nf, type Tela } from "./comum.ts";

/**
 * Tela Regras: o texto do protocolo, como pesar, regras do corte, quando mudar
 * de bloco, e as premissas. Conteudo vem de plano.json, nao e hardcoded aqui.
 */

/** Escapa o HTML e depois converte **negrito** em <b>. Nessa ordem, senao escapa o <b>. */
function comNegrito(texto: string): string {
  return esc(texto).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

/**
 * Os numeros da regra de bloco vem de parametros.autorregulacao, a mesma fonte
 * que a tela Peso usa para decidir. Texto e decisao nao podem divergir de novo.
 */
function comParametros(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (tudo, chave: string) => valores[chave] ?? tudo);
}

export const telaRegras: Tela = {
  render(ctx) {
    const { regras, fontes, parametros } = ctx.plano;
    const valores = {
      desvioKg: nf(parametros.autorregulacao.desvioKg, 1),
      semanas: String(parametros.autorregulacao.semanas),
    };
    return `
      <div class="rules">
        ${regras
          .map(
            (r) => `<div><h3>${esc(r.titulo)}</h3><ul>${r.itens
              .map((i) => `<li>${comNegrito(comParametros(i, valores))}</li>`)
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
