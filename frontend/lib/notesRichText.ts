function looksFormulaSegment(text: string) {
  const stripped = text.trim();
  if (!stripped || stripped.includes("$")) {
    return false;
  }

  const operatorCount = (stripped.match(/=|\+|-|\*|\/|\^|\||√|±|≤|≥|!=|->/g) || []).length;
  const words = stripped.match(/[A-Za-z]+/g) || [];

  if (operatorCount < 1) {
    return false;
  }
  if (words.length <= 4) {
    return true;
  }
  return operatorCount >= 3 && words.length <= 7;
}

function wrapFormula(segment: string) {
  const trimmed = segment.trim();
  if (!looksFormulaSegment(trimmed)) {
    return segment;
  }
  return segment.replace(trimmed, `$${trimmed}$`);
}

export function enrichNoteMath(text: string) {
  if (!text.trim() || text.includes("$") || text.includes("```")) {
    return text;
  }

  let enriched = text;

  enriched = enriched.replace(/\(([^()]{3,96})\)/g, (match, inner) => {
    if (!looksFormulaSegment(inner)) {
      return match;
    }
    return `($${inner.trim()}$)`;
  });

  enriched = enriched.replace(/(:\s*)([^:;\n]{3,120})/g, (match, prefix, tail) => {
    const wrappedTail = wrapFormula(tail);
    return wrappedTail === tail ? match : `${prefix}${wrappedTail.trim()}`;
  });

  const fullyWrapped = wrapFormula(enriched);
  return fullyWrapped;
}
