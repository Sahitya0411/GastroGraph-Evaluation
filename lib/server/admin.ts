import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { ParticipantRow, ResponseRow } from "@/lib/metrics";

export const RESULTS_COOKIE = "gg_results";

/** Token stored in the cookie: a hash of the password, never the password itself. */
export function resultsToken(password: string) {
  return createHash("sha256").update(`gastrograph-results:${password}`).digest("hex");
}

export function passwordMatches(input: string) {
  const expected = process.env.RESULTS_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(resultsToken(input));
  const b = Buffer.from(resultsToken(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isResultsAuthed() {
  const expected = process.env.RESULTS_PASSWORD;
  if (!expected) return false;
  const token = (await cookies()).get(RESULTS_COOKIE)?.value ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(resultsToken(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminConfigError(): string | null {
  const missing = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !process.env.SUPABASE_SECRET_KEY && "SUPABASE_SECRET_KEY",
    !process.env.RESULTS_PASSWORD && "RESULTS_PASSWORD",
  ].filter(Boolean);
  return missing.length ? `Missing environment variable(s): ${missing.join(", ")}` : null;
}

/** Reads every row with the secret key (bypasses RLS) — server only. */
export async function fetchStudyData(): Promise<{ responses: ResponseRow[]; participants: ParticipantRow[] }> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function all<T>(table: string): Promise<T[]> {
    const out: T[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await db.from(table).select("*").order("created_at").range(from, from + page - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data as T[]));
      if (!data || data.length < page) return out;
    }
  }

  const [responses, participants] = await Promise.all([
    all<ResponseRow>("responses"),
    all<ParticipantRow>("participants"),
  ]);
  return { responses, participants };
}
