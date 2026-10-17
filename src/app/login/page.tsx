"use client";
import Image from "next/image";
import Link from "next/link";
import "./login.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import "../workspace/workspace.css";
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-content">
          <header className="login-header">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                fi
              </span>
              Factory Interviews
            </Link>
            <span>TEAM WORKSPACE</span>
          </header>
          <div className="login-form-wrap">
            <p className="login-kicker">01 / Your next conversation</p>
            <h1>
              Good to see
              <br />
              you again.
            </h1>
            <p className="login-description">
              A little conversation. A clearer next step.
              <br />
              Sign in to your team’s interview workspace.
            </p>
            <form
              className="form-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(event.currentTarget);
                try {
                  const response = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: form.get("email"),
                      password: form.get("password"),
                    }),
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error);
                  router.replace("/workspace");
                  router.refresh();
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not sign in.",
                  );
                  setBusy(false);
                }
              }}
            >
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              </div>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="muted">
              Ask your workspace administrator for an account.
            </p>
          </div>
          <footer className="login-footer">
            Listen carefully. Keep the evidence. Move forward.
          </footer>
        </section>
        <aside
          className="login-art"
          aria-label="A cheerful computer in a sunny meadow"
        >
          <Image
            src="/images/login-meadow.webp"
            alt=""
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
            preload
          />
          <div className="art-caption">
            <span>A FRESH PERSPECTIVE</span>
            <p>
              Big ideas start
              <br />
              with a conversation.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
