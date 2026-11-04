"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, readApiError } from "./http";
import type { SessionResponse } from "./contracts";
import { BrandLogo } from "./brand-logo";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch("/api/auth/get-session")
      .then(async (response) => {
        if (response.status === 401) return;
        if (!response.ok) throw new Error(await readApiError(response, "Não foi possível verificar a sessão."));
        const session = (await response.json()) as SessionResponse;
        if (active && session?.user) router.replace("/dashboard");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível verificar a sessão. Tente novamente.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "Não foi possível entrar. Confira seus dados."));
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao serviço. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <main className="login-page" id="main-content">
      <header><BrandLogo className="login-brand-mark" /></header>

      <section className="login-layout" aria-labelledby="login-title">
        <div className="login-intro">
          <p className="eyebrow">GESTÃO DE ESPAÇOS · EM METROS</p>
          <h1 id="login-title">Planeje o espaço.<br /><em>Organize a fila.</em></h1>
          <p className="intro-copy">Entre para acessar seus projetos e continuar o planejamento.</p>
          <div className="plan-drawing" aria-hidden="true">
            <div className="plan-room"><span className="plan-door" /><span className="plan-window" />
              <div className="plan-queue"><span /><span /><span /><span /><span /></div>
              <div className="plan-path" />
            </div>
            <span className="plan-dimension plan-width">DIMENSÕES EM METROS</span>
            <span className="plan-note">PLANTA · VISTA SUPERIOR</span>
          </div>
        </div>

        <div className="login-panel">
          <p className="panel-index">Acesso à conta</p>
          <h2>Acesse seus projetos</h2>
          <p className="panel-copy">Use o e-mail e a senha da sua conta.</p>
          {checking ? (
            <div className="form-loading" role="status"><span className="spinner" /> Verificando sessão</div>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" autoComplete="username" inputMode="email" spellCheck={false}
                required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" autoComplete="current-password"
                required value={password} onChange={(event) => setPassword(event.target.value)} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button-primary login-submit" type="submit" disabled={submitting}>
                {submitting ? <><span className="spinner spinner-light" /> Entrando</> : <>Entrar <span aria-hidden="true">↗</span></>}
              </button>
            </form>
          )}
          <p className="login-footnote">Acesso restrito a contas provisionadas pela equipe.</p>
        </div>
      </section>
    </main>
    </>
  );
}
