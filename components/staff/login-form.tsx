"use client";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Notice, Spinner } from "@/components/ui/ui";
import { ApiError } from "@/lib/client/api";
import { signIn } from "@/lib/client/hooks";
import type { LocalProfile } from "@/lib/client/db";

export function LoginForm({ onDone }: { onDone: (profile: LocalProfile) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="grid gap-4"
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true); setError("");
        try { onDone(await signIn(username.trim(), password.trim())); }
        catch (cause) { setError(cause instanceof ApiError ? cause.message : "Couldn't sign in."); setPassword(""); }
        finally { setBusy(false); }
      }}
    >
      <label className="field">
        <span>username</span>
        <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={e => setUsername(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>password</span>
        <span className="relative block">
          <input className="input pr-12" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" className="absolute inset-y-0 right-0 grid w-12 place-items-center text-mute hover:text-ink" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className="btn btn-solid btn-lg mt-1 w-full" disabled={busy}>
        {busy ? <Spinner /> : <>sign in <ArrowRight className="h-5 w-5" /></>}
      </button>
    </form>
  );
}
