import { QUESTION_POOL } from "./questions";

export type Model = "gastrograph" | "embedding" | "context";
export const MODELS: Model[] = ["gastrograph", "embedding", "context"];

export const MODEL_META: Record<Model, { name: string; short: string; color: string }> = {
  gastrograph: { name: "GastroGraph (GNN)", short: "GastroGraph", color: "#2a78d6" },
  embedding: { name: "Embedding baseline", short: "Embedding", color: "#eb6834" },
  context: { name: "Context Reranker", short: "Context", color: "#1baf7a" },
};

export type ResponseRow = {
  created_at: string;
  session_id: string;
  round_number: number;
  question_number: number;
  ingredient: string;
  recipe: string | null;
  option_a: string;
  option_b: string;
  option_c: string | null;
  gastrograph_option: string;
  embedding_option: string | null;
  context_option: string | null;
  selected_option: string;
  selected_ingredient: string;
  is_gastrograph_selected: boolean;
  is_embedding_selected: boolean | null;
  is_context_selected: boolean | null;
  response_time_ms: number | null;
};

export type ParticipantRow = {
  created_at: string;
  session_id: string;
  name: string;
  email: string | null;
  institution: string | null;
  age_group: string | null;
  gender: string | null;
  profession: string | null;
  ingredient_familiarity: number | null;
};

/** A response from the 3-model study (older 2-option rows have no context column). */
type FullRow = ResponseRow & { embedding_option: string; context_option: string };

const isFull = (r: ResponseRow): r is FullRow =>
  r.is_context_selected !== null && r.embedding_option !== null && r.context_option !== null;

const picked = (r: FullRow, m: Model) =>
  m === "gastrograph" ? r.is_gastrograph_selected : m === "embedding" ? !!r.is_embedding_selected : !!r.is_context_selected;

const optionOf = (r: FullRow, m: Model) =>
  m === "gastrograph" ? r.gastrograph_option : m === "embedding" ? r.embedding_option : r.context_option;

// ── statistics helpers ──────────────────────────────────────────────────────

/** Wilson score 95% interval for k successes out of n. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function normalCdf(x: number) {
  // Abramowitz–Stegun 7.1.26 approximation of erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Two-sided sign test (normal approximation with continuity correction). */
function signTestP(a: number, b: number) {
  const n = a + b;
  if (n === 0) return 1;
  const z = (Math.abs(a - n / 2) - 0.5) / Math.sqrt(n / 4);
  return Math.min(1, 2 * (1 - normalCdf(Math.max(0, z))));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── metrics ─────────────────────────────────────────────────────────────────

export type ModelStat = { model: Model; k: number; n: number; rate: number; ci: [number, number] };

export type Metrics = ReturnType<typeof computeMetrics>;

export function computeMetrics(allResponses: ResponseRow[], participants: ParticipantRow[]) {
  const rows = allResponses.filter(isFull);
  const legacyRows = allResponses.length - rows.length;
  const distinct = rows.filter((r) => r.option_c !== null); // all three models disagreed

  const stat = (subset: FullRow[], m: Model): ModelStat => {
    const k = subset.filter((r) => picked(r, m)).length;
    return { model: m, k, n: subset.length, rate: subset.length ? k / subset.length : 0, ci: wilson(k, subset.length) };
  };

  // 1) Fair 3-way share: only questions where all three suggestions differ; sums to 100%, chance = 33.3%.
  const share = MODELS.map((m) => stat(distinct, m));
  const expected = distinct.length / 3;
  const chi2 = expected ? share.reduce((s, x) => s + (x.k - expected) ** 2 / expected, 0) : 0;
  const chi2P = expected ? Math.exp(-chi2 / 2) : 1; // df = 2

  // 2) Pick rate over every answer (an option two models agree on credits both).
  const pickRate = MODELS.map((m) => stat(rows, m));

  // 3) Head-to-head: of the answers where X and Y differ and one of them was chosen.
  const pairs: [Model, Model][] = [
    ["gastrograph", "embedding"],
    ["gastrograph", "context"],
    ["context", "embedding"],
  ];
  const headToHead = pairs.map(([x, y]) => {
    const relevant = rows.filter((r) => optionOf(r, x) !== optionOf(r, y));
    const xWins = relevant.filter((r) => r.selected_option === optionOf(r, x)).length;
    const yWins = relevant.filter((r) => r.selected_option === optionOf(r, y)).length;
    const n = xWins + yWins;
    return { x, y, xWins, yWins, n, xRate: n ? xWins / n : 0, p: signTestP(xWins, yWins) };
  });

  // 4) Breakdowns by participant attributes.
  const bySession = new Map(participants.map((p) => [p.session_id, p]));
  const groupBy = (key: (p: ParticipantRow | undefined) => string) => {
    const groups = new Map<string, FullRow[]>();
    for (const r of rows) {
      const g = key(bySession.get(r.session_id));
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    return [...groups.entries()]
      .map(([group, rs]) => ({
        group,
        n: rs.length,
        participants: new Set(rs.map((r) => r.session_id)).size,
        rates: MODELS.map((m) => stat(rs, m)),
      }))
      .sort((a, b) => b.n - a.n);
  };
  const byProfession = groupBy((p) => p?.profession || "Unknown");
  const byFamiliarity = groupBy((p) =>
    p?.ingredient_familiarity ? `Familiarity ${p.ingredient_familiarity}/5` : "Unknown",
  ).sort((a, b) => a.group.localeCompare(b.group));

  // 5) Per question.
  const poolByIngredient = new Map(QUESTION_POOL.map((q) => [q.ingredient, q]));
  const perQuestionMap = new Map<string, FullRow[]>();
  for (const r of rows) perQuestionMap.set(r.ingredient, [...(perQuestionMap.get(r.ingredient) ?? []), r]);
  const questionsWon: Record<Model, number> = { gastrograph: 0, embedding: 0, context: 0 };
  const perQuestion = [...perQuestionMap.entries()]
    .map(([ingredient, rs]) => {
      const q = poolByIngredient.get(ingredient);
      const votes = Object.fromEntries(MODELS.map((m) => [m, rs.filter((r) => picked(r, m)).length])) as Record<Model, number>;
      const top = Math.max(...MODELS.map((m) => votes[m]));
      const winners = MODELS.filter((m) => votes[m] === top && top > 0);
      // Every model tied for the most votes counts as winning that question.
      for (const m of winners) questionsWon[m] += 1;
      return {
        ingredient,
        recipe: q?.recipe ?? rs[0].recipe ?? "",
        subs: {
          gastrograph: q?.gastrograph_sub ?? "",
          embedding: q?.embedding_sub ?? "",
          context: q?.context_sub ?? "",
        } as Record<Model, string>,
        n: rs.length,
        votes,
        winners,
      };
    })
    .sort((a, b) => b.n - a.n || a.ingredient.localeCompare(b.ingredient));

  // 6) Response time.
  const times = rows.map((r) => r.response_time_ms).filter((t): t is number => typeof t === "number" && t > 0);
  const timeByModel = MODELS.map((m) => ({
    model: m,
    median: median(rows.filter((r) => picked(r, m)).map((r) => r.response_time_ms ?? 0).filter((t) => t > 0)),
  }));

  const activeSessions = new Set(rows.map((r) => r.session_id));

  return {
    totals: {
      participants: participants.length,
      participantsWithAnswers: activeSessions.size,
      answers: rows.length,
      distinctAnswers: distinct.length,
      questionsCovered: perQuestion.length,
      questionPool: QUESTION_POOL.length,
      medianTimeMs: median(times),
      avgAnswersPerParticipant: activeSessions.size ? rows.length / activeSessions.size : 0,
      legacyRows,
    },
    share,
    chi2,
    chi2P,
    pickRate,
    headToHead,
    byProfession,
    byFamiliarity,
    perQuestion,
    questionsWon,
    timeByModel,
  };
}
