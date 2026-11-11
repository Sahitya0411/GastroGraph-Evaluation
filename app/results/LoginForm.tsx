"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, { error: "" });
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3 sm:flex-row">
      <input
        type="password"
        name="password"
        required
        autoFocus
        placeholder="Results password"
        aria-label="Results password"
        className="flex-1 rounded-lg border border-[#E4D7CA] bg-white px-4 py-3"
      />
      <button disabled={pending} className="button-primary rounded-xl px-6 py-3 font-semibold">
        {pending ? "Checking…" : "View results →"}
      </button>
      <p aria-live="polite" className="text-sm text-[#A55732] sm:self-center">{state.error}</p>
    </form>
  );
}
