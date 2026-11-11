import type { Metadata } from "next";
import { adminConfigError, fetchStudyData, isResultsAuthed } from "@/lib/server/admin";
import { computeMetrics, MODEL_META, MODELS, type Metrics, type Model, type ModelStat } from "@/lib/metrics";
import LoginForm from "./LoginForm";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "Study Results · GastroGraph",
  robots: { index: false, follow: false },
};

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
const seconds = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);

function Swatch({ model }: { model: Model }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm align-middle"
      style={{ background: MODEL_META[model].color }}
    />
  );
}

function ModelName({ model, short = false }: { model: Model; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Swatch model={model} />
      {short ? MODEL_META[model].short : MODEL_META[model].name}
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-[#6B5E57]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#2C2420]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[#6B5E57]">{sub}</p>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card mt-6 p-6 md:p-8">
      <h2 className="text-2xl text-[#2C2420]">{title}</h2>
      {note && <p className="mt-2 text-sm text-[#6B5E57]">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Horizontal bars with 95% CI whiskers and an optional chance line. */
function RateBars({ stats, chance }: { stats: ModelStat[]; chance?: number }) {
  return (
    <div className="space-y-5">
      {stats.map((s) => (
        <div
          key={s.model}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[170px_1fr] sm:items-center"
          title={`${MODEL_META[s.model].name}: ${pct(s.rate)} (${s.k}/${s.n}), 95% CI ${pct(s.ci[0])}–${pct(s.ci[1])}`}
        >
          <p className="text-sm text-[#2C2420]">
            <ModelName model={s.model} />
          </p>
          <div>
            <div className="relative h-7 rounded bg-[#F2ECE6]">
              <div
                className="absolute inset-y-0 left-0 rounded-r"
                style={{ width: `${s.rate * 100}%`, background: MODEL_META[s.model].color }}
              />
              {s.n > 0 && (
                <div
                  aria-hidden
                  className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-[#2C2420]"
                  style={{ left: `${s.ci[0] * 100}%`, width: `${(s.ci[1] - s.ci[0]) * 100}%` }}
                >
                  <span className="absolute -top-[5px] left-0 h-3 w-[2px] bg-[#2C2420]" />
                  <span className="absolute -top-[5px] right-0 h-3 w-[2px] bg-[#2C2420]" />
                </div>
              )}
              {chance !== undefined && (
                <div
                  aria-hidden
                  className="absolute -inset-y-1 border-l-2 border-dashed border-[#6B5E57]"
                  style={{ left: `${chance * 100}%` }}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-[#6B5E57]">
              <span className="font-semibold text-[#2C2420]">{pct(s.rate)}</span> · {s.k} of {s.n} · 95% CI{" "}
              {pct(s.ci[0], 0)}–{pct(s.ci[1], 0)}
            </p>
          </div>
        </div>
      ))}
      {chance !== undefined && (
        <p className="text-xs text-[#6B5E57]">Dashed line = chance level ({pct(chance)}). Black whisker = 95% confidence interval.</p>
      )}
    </div>
  );
}

function HeadToHead({ rows }: { rows: Metrics["headToHead"] }) {
  return (
    <div className="space-y-6">
      {rows.map((h) => (
        <div key={`${h.x}-${h.y}`}>
          <div className="flex items-center justify-between text-sm text-[#2C2420]">
            <ModelName model={h.x} />
            <ModelName model={h.y} />
          </div>
          <div
            className="mt-2 flex h-7 gap-[2px] overflow-hidden rounded"
            title={`${MODEL_META[h.x].short} ${h.xWins} vs ${MODEL_META[h.y].short} ${h.yWins} (n=${h.n}, ${fmtP(h.p)})`}
          >
            {h.n === 0 ? (
              <div className="flex-1 bg-[#F2ECE6]" />
            ) : (
              <>
                <div style={{ width: `${h.xRate * 100}%`, background: MODEL_META[h.x].color }} />
                <div className="flex-1" style={{ background: MODEL_META[h.y].color }} />
              </>
            )}
          </div>
          <div className="mt-1 flex justify-between text-xs text-[#6B5E57]">
            <span>
              <span className="font-semibold text-[#2C2420]">{pct(h.xRate)}</span> ({h.xWins})
            </span>
            <span>
              n = {h.n} · {fmtP(h.p)}
              {h.n > 0 && h.p < 0.05 ? " · significant" : ""}
            </span>
            <span>
              <span className="font-semibold text-[#2C2420]">{pct(h.n ? 1 - h.xRate : 0)}</span> ({h.yWins})
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupTable({ label, groups }: { label: string; groups: Metrics["byProfession"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-[#EEE3D8] text-left text-[#6B5E57]">
            <th className="py-2 pr-3 font-medium">{label}</th>
            <th className="py-2 pr-3 text-right font-medium">People</th>
            <th className="py-2 pr-3 text-right font-medium">Answers</th>
            {MODELS.map((m) => (
              <th key={m} className="py-2 pr-3 text-right font-medium">
                <ModelName model={m} short />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const best = Math.max(...g.rates.map((r) => r.rate));
            return (
              <tr key={g.group} className="border-b border-[#F4EEE7]">
                <td className="py-2 pr-3 text-[#2C2420]">{g.group}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{g.participants}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{g.n}</td>
                {g.rates.map((r) => (
                  <td
                    key={r.model}
                    className={`py-2 pr-3 text-right tabular-nums ${r.rate === best && best > 0 ? "font-semibold text-[#2C2420]" : "text-[#6B5E57]"}`}
                  >
                    {pct(r.rate)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuestionTable({ rows }: { rows: Metrics["perQuestion"] }) {
  return (
    <div className="max-h-[640px] overflow-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-[#EEE3D8] text-left text-[#6B5E57]">
            <th className="py-2 pr-3 font-medium">Ingredient</th>
            <th className="py-2 pr-3 font-medium">Dish</th>
            {MODELS.map((m) => (
              <th key={m} className="py-2 pr-3 font-medium">
                <ModelName model={m} short />
              </th>
            ))}
            <th className="py-2 pr-3 text-right font-medium">Answers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.ingredient} className="border-b border-[#F4EEE7] align-top">
              <td className="py-2 pr-3 font-semibold text-[#2C2420]">{q.ingredient}</td>
              <td className="py-2 pr-3 text-[#6B5E57]">{q.recipe}</td>
              {MODELS.map((m) => {
                const win = q.winners.includes(m);
                return (
                  <td key={m} className="py-2 pr-3">
                    <span className={win ? "font-semibold text-[#2C2420]" : "text-[#6B5E57]"}>{q.subs[m]}</span>
                    <span className="ml-1 tabular-nums text-xs text-[#6B5E57]">
                      ({q.votes[m]}){win ? " ★" : ""}
                    </span>
                  </td>
                );
              })}
              <td className="py-2 pr-3 text-right tabular-nums">{q.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen w-full max-w-[1100px] p-4 md:p-10">{children}</main>;
}

export default async function ResultsPage() {
  const configError = adminConfigError();
  if (configError) {
    return (
      <Shell>
        <section className="card mt-8 p-8">
          <h1 className="text-3xl text-[#2C2420]">Results dashboard not configured</h1>
          <p className="mt-3 text-[#6B5E57]">{configError}. Add it to .env.local (and to Vercel → Settings → Environment Variables).</p>
        </section>
      </Shell>
    );
  }

  if (!(await isResultsAuthed())) {
    return (
      <Shell>
        <section className="card mx-auto mt-16 max-w-[560px] p-8">
          <h1 className="text-3xl text-[#2C2420]">Study Results</h1>
          <p className="mt-2 text-sm text-[#6B5E57]">For the GastroGraph research team only.</p>
          <LoginForm />
        </section>
      </Shell>
    );
  }

  let m: Metrics;
  try {
    const { responses, participants } = await fetchStudyData();
    m = computeMetrics(responses, participants);
  } catch (err) {
    return (
      <Shell>
        <section className="card mt-8 p-8">
          <h1 className="text-3xl text-[#2C2420]">Could not load results</h1>
          <p className="mt-3 text-[#6B5E57]">{(err as Error).message}</p>
        </section>
      </Shell>
    );
  }

  const t = m.totals;
  const leader = [...m.share].sort((a, b) => b.rate - a.rate)[0];

  return (
    <Shell>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-[#2C2420] md:text-4xl">Study Results</h1>
          <p className="mt-1 text-sm text-[#6B5E57]">
            Live from Supabase · {MODELS.map((x) => MODEL_META[x].name).join(" vs ")}
          </p>
        </div>
        <div className="flex gap-3">
          <a href="/results/export" className="button-primary rounded-xl px-5 py-2.5 text-sm font-semibold">
            Download CSV
          </a>
          <form action={logout}>
            <button className="rounded-xl border border-[#C1440E] px-5 py-2.5 text-sm text-[#C1440E]">Log out</button>
          </form>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Participants" value={String(t.participantsWithAnswers)} sub={`${t.participants} registered`} />
        <Tile label="Answers" value={String(t.answers)} sub={`${t.avgAnswersPerParticipant.toFixed(1)} per participant`} />
        <Tile label="Questions covered" value={`${t.questionsCovered}/${t.questionPool}`} sub={`${t.distinctAnswers} answers with 3 distinct options`} />
        <Tile label="Median time / answer" value={seconds(t.medianTimeMs)} />
      </div>

      {t.answers === 0 ? (
        <section className="card mt-6 p-8 text-center text-[#6B5E57]">
          No submitted answers yet. Results appear here as soon as a participant finishes their first round of 10.
        </section>
      ) : (
        <>
          <Section
            title="Preference share (3-way)"
            note="Only answers where all three models suggested different ingredients, so the shares add up to 100% and chance is 33.3%. This is the fairest single comparison."
          >
            <RateBars stats={m.share} chance={1 / 3} />
            {t.distinctAnswers > 0 && (
              <p className="mt-5 rounded-lg bg-[#FFFCF9] p-3 text-sm text-[#2C2420]">
                Leader: <ModelName model={leader.model} /> with {pct(leader.rate)}. Chi-square vs. equal preference: χ² ={" "}
                {m.chi2.toFixed(2)} (df = 2), {fmtP(m.chi2P)}
                {m.chi2P < 0.05 ? " — the models are preferred unequally." : " — not yet significantly different from chance."}
              </p>
            )}
          </Section>

          <Section
            title="Head-to-head"
            note="For each pair: of the answers where the two models suggested different ingredients and the participant chose one of them, how often each won. Sign test, two-sided."
          >
            <HeadToHead rows={m.headToHead} />
          </Section>

          <div className="grid gap-0 md:grid-cols-2 md:gap-6">
            <Section
              title="Pick rate (all answers)"
              note="Share of every answer where the model's suggestion was chosen. When two models suggested the same ingredient, picking it counts for both, so these can add up to more than 100%."
            >
              <RateBars stats={m.pickRate} />
            </Section>
            <Section title="Questions won" note="Ingredients where the model's suggestion got the most votes (ties count for every tied model).">
              <div className="space-y-3">
                {MODELS.map((x) => (
                  <div key={x} className="flex items-center justify-between rounded-lg bg-[#FFFCF9] px-4 py-3">
                    <ModelName model={x} />
                    <span className="text-xl font-semibold tabular-nums text-[#2C2420]">
                      {m.questionsWon[x]}
                      <span className="text-sm font-normal text-[#6B5E57]"> / {t.questionsCovered}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-[#6B5E57]">Median decision time when the model was chosen:</p>
              <ul className="mt-2 space-y-1 text-sm">
                {m.timeByModel.map((x) => (
                  <li key={x.model} className="flex justify-between">
                    <ModelName model={x.model} short />
                    <span className="tabular-nums">{seconds(x.median)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="By profession" note="Pick rate within each group (bold = highest in the row).">
            <GroupTable label="Profession" groups={m.byProfession} />
          </Section>

          <Section title="By ingredient familiarity" note="Self-rated familiarity with a wide range of ingredients (1–5).">
            <GroupTable label="Familiarity" groups={m.byFamiliarity} />
          </Section>

          <Section title="Per ingredient" note="Each model's suggestion with its vote count. ★ marks the most-voted option for that ingredient.">
            <QuestionTable rows={m.perQuestion} />
          </Section>

          {t.legacyRows > 0 && (
            <p className="mt-4 text-xs text-[#6B5E57]">
              {t.legacyRows} older two-option answers (from before the Context Reranker was added) are excluded from these
              metrics but included in the CSV.
            </p>
          )}
        </>
      )}
    </Shell>
  );
}
