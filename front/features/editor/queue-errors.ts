const friendlyRules: Array<[RegExp, string]> = [
  [/^poste\b/i, "Um poste está fora do espaço disponível ou sem a folga necessária. Confira sua posição."],
  [/^fita\b/i, "Uma fita não pode ser conectada desse jeito. Confira os postes e o espaço livre entre eles."],
  [/^área\b|^area\b/i, "Uma área restrita precisa ficar dentro do ambiente e ter um contorno válido."],
  [/^percurso\b/i, "O percurso precisa ficar dentro do ambiente e livre de obstáculos."],
  [/^pessoa\b/i, "Uma pessoa não cabe nessa posição com o espaçamento atual."],
  [/identificador|referência|referencia/i, "Há itens repetidos ou incompletos. Desfaça a última alteração e tente novamente."],
  [/^documento de cena/i, "Os dados desta montagem não são compatíveis. Recarregue o projeto para continuar."],
];

/** Converte detalhes internos do domínio em orientação curta sem expor IDs ao público. */
export function queueErrorsForUser(details: readonly string[], fallback: string): string[] {
  if (process.env.NODE_ENV !== "production" && details.length) {
    console.debug("[queue-editor] Detalhes de validação do domínio:", details);
  }

  return details.map((detail) => {
    const rule = friendlyRules.find(([pattern]) => pattern.test(detail));
    if (rule) return rule[1];
    if (/inval|n[aã]o encontrada|n[aã]o existe|n[aã]o cabe|colid|cruza|ultrapassa|inv[aá]lid/i.test(detail)) {
      return fallback;
    }
    return detail.replace(/\b(?:post|area|belt|route|person|vertex)-[0-9a-f-]{8,}\b/gi, "item");
  });
}
