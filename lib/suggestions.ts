export type Suggestion = {
  kind: 'info' | 'warn';
  text: string;
};

export function lintPrompt(text: string): Suggestion[] {
  const t = text.trim();
  const out: Suggestion[] = [];
  if (!t) return out;

  if (t.length < 30) {
    out.push({
      kind: 'warn',
      text: 'Very short — add context, constraints, or examples for better results.',
    });
  }

  if (!/for example|e\.g\.|like:|such as|sample:/i.test(t) && t.length > 60) {
    out.push({
      kind: 'info',
      text: 'No examples — adding one ("for example, ...") often improves accuracy.',
    });
  }

  if (!/\b(json|markdown|list|table|format|output|return|respond with|in the form)\b/i.test(t)) {
    out.push({
      kind: 'info',
      text: 'No output format specified — say "respond as JSON / markdown / a list" if you care.',
    });
  }

  const questionMarks = (t.match(/\?/g) ?? []).length;
  if (questionMarks > 2) {
    out.push({
      kind: 'warn',
      text: `${questionMarks} questions in one prompt — consider splitting them or numbering them.`,
    });
  }

  if (/^\s*(it|that|this|they)\b/i.test(t)) {
    out.push({
      kind: 'warn',
      text: 'Starts with a pronoun ("it"/"that"/"this") with no antecedent — be explicit.',
    });
  }

  if (t.length > 4000) {
    out.push({
      kind: 'info',
      text: `Long prompt (~${Math.ceil(t.length / 4)} tokens) — consider trimming or summarizing context.`,
    });
  }

  if (/\b(asap|urgent|please|kindly)\b/i.test(t)) {
    out.push({
      kind: 'info',
      text: 'Politeness words don\'t help models — drop them to save tokens.',
    });
  }

  return out;
}
