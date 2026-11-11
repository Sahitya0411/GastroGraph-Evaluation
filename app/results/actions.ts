"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { passwordMatches, RESULTS_COOKIE, resultsToken } from "@/lib/server/admin";

export async function login(_prev: { error: string }, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) return { error: "Wrong password." };
  (await cookies()).set(RESULTS_COOKIE, resultsToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/results",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/results");
}

export async function logout() {
  (await cookies()).delete({ name: RESULTS_COOKIE, path: "/results" });
  redirect("/results");
}
