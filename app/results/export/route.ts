import { NextResponse } from "next/server";
import { adminConfigError, fetchStudyData, isResultsAuthed } from "@/lib/server/admin";

const COLUMNS = [
  "created_at", "session_id", "participant_name", "institution", "profession", "age_group", "gender",
  "ingredient_familiarity", "round_number", "question_number", "ingredient", "recipe", "option_a", "option_b",
  "option_c", "gastrograph_option", "embedding_option", "context_option", "selected_option", "selected_ingredient",
  "is_gastrograph_selected", "is_embedding_selected", "is_context_selected", "response_time_ms",
] as const;

export async function GET() {
  if (adminConfigError() || !(await isResultsAuthed())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { responses, participants } = await fetchStudyData();
  const bySession = new Map(participants.map((p) => [p.session_id, p]));
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = responses.map((r) => {
    const p = bySession.get(r.session_id);
    const row: Record<string, unknown> = {
      ...r,
      participant_name: p?.name,
      institution: p?.institution,
      profession: p?.profession,
      age_group: p?.age_group,
      gender: p?.gender,
      ingredient_familiarity: p?.ingredient_familiarity,
    };
    return COLUMNS.map((c) => esc(row[c])).join(",");
  });
  const csv = [COLUMNS.join(","), ...lines].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gastrograph_eval_${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
