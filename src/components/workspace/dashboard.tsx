"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createExample, createSession, stage } from "@/lib/interviews";
import {
  addSession,
  importLocalSessions,
  downloadRecovery,
  useWorkspace,
} from "@/lib/workspace-store";
import { errorText, Field, formText } from "./ui";

export function Dashboard() {
  const { sessions, loaded, error } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All sessions");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);
  const router = useRouter();

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const data = new FormData(event.currentTarget);
      const session = createSession({
        factory: formText(data, "factory"),
        process: formText(data, "process"),
        objective: formText(data, "objective"),
        reviewer: formText(data, "reviewer"),
      });
      await addSession(session);
      router.push(`/workspace/${session.id}`);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  async function example() {
    if (pending) return;
    setPending(true);
    try {
      const session = createExample();
      await addSession(session);
      router.push(`/workspace/${session.id}?view=review`);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  const visible = sessions.filter(
    (session) =>
      `${session.factory} ${session.process} ${session.reviewer}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "All sessions" || stage(session) === filter),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>
            Good decisions start
            <br className="desktop-break" /> with a conversation.
          </h1>
          <p>
            Capture one process. Check what matters. Choose a useful next step.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={example}
          disabled={!loaded || !!error || pending}
        >
          Explore a sample session <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className="muted">
        Saved on the server and shared with your team.{" "}
        <button
          className="text-button"
          disabled={!loaded || !!error || pending}
          onClick={async () => {
            try {
              await importLocalSessions();
              setMessage(
                "Local interviews imported. The original browser copy was retained.",
              );
            } catch (error) {
              setMessage(errorText(error));
            }
          }}
        >
          Import earlier browser interviews
        </button>
      </p>
      <div className="metrics" aria-label="Workspace summary">
        <div>
          <span>Sessions</span>
          <strong>{sessions.length.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Need review</span>
          <strong>
            {sessions
              .filter((session) => stage(session) === "Needs review")
              .length.toString()
              .padStart(2, "0")}
          </strong>
        </div>
        <div>
          <span>Ready for a decision</span>
          <strong>
            {sessions
              .filter((session) => stage(session) === "Ready for decision")
              .length.toString()
              .padStart(2, "0")}
          </strong>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="button secondary"
            onClick={() => {
              try {
                downloadRecovery();
              } catch (error) {
                setMessage(errorText(error));
              }
            }}
          >
            Download recovery copy
          </button>
        </div>
      )}
      {pending && <p role="status">Saving session…</p>}
      {message && (
        <p className="notice error" role="alert" ref={messageRef} tabIndex={-1}>
          {message}
        </p>
      )}
      <div className="dashboard-grid">
        <section
          className="panel sessions-panel"
          aria-labelledby="sessions-heading"
        >
          <div className="panel-heading row">
            <div>
              <span className="eyebrow">Keep work moving</span>
              <h2 id="sessions-heading">Interview sessions</h2>
            </div>
            {sessions.length > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  try {
                    downloadRecovery();
                  } catch (error) {
                    setMessage(errorText(error));
                  }
                }}
              >
                Download backup
              </button>
            )}
          </div>
          <div className="filters">
            <div className="field">
              <label htmlFor="search">Search sessions</label>
              <input
                id="search"
                type="search"
                placeholder="Process, factory, or reviewer"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="stage">Stage</label>
              <select
                id="stage"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {[
                  "All sessions",
                  "Planned",
                  "In progress",
                  "Needs review",
                  "Ready for decision",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>
          {!loaded ? (
            <p role="status" className="empty-state">
              Loading your sessions…
            </p>
          ) : visible.length ? (
            <ul className="session-list">
              {visible.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/workspace/${session.id}`}
                    className="session-link"
                  >
                    <div className="session-link-main">
                      <span className="muted">
                        {session.factory}
                        {session.synthetic ? " · Synthetic example" : ""}
                      </span>
                      <h3>{session.process}</h3>
                      <p>{session.objective}</p>
                      <span className="muted">
                        Reviewer: {session.reviewer}
                      </span>
                    </div>
                    <div className="session-meta">
                      <span
                        className={`badge ${stage(session) === "Ready for decision" ? "success" : ""}`}
                      >
                        {stage(session)}
                      </span>
                      <span className="muted">
                        Revision {session.revision}{" "}
                        <span aria-hidden="true">↗</span>
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-symbol" aria-hidden="true">
                01
              </span>
              <h3>
                {sessions.length
                  ? "No matching sessions"
                  : "Your first conversation starts here"}
              </h3>
              <p>
                {sessions.length
                  ? "Try another search or stage."
                  : "Create a session for one factory process, or explore the synthetic example to see how review works."}
              </p>
            </div>
          )}
        </section>
        <section className="panel new-session" aria-labelledby="create-heading">
          <div className="panel-heading">
            <span className="eyebrow">A focused start</span>
            <h2 id="create-heading">New session</h2>
            <p>Keep the scope small enough for one interview.</p>
          </div>
          <form onSubmit={create} className="form-stack">
            <Field
              label="Factory or workspace"
              name="factory"
              maxLength={120}
            />
            <Field label="Process name" name="process" maxLength={160} />
            <Field
              label="What do you want to understand?"
              name="objective"
              multiline
              maxLength={1000}
            />
            <Field
              label="Responsible reviewer"
              name="reviewer"
              maxLength={120}
            />
            <button
              className="button"
              type="submit"
              disabled={!loaded || !!error || pending}
            >
              Create session <span aria-hidden="true">→</span>
            </button>
            <p className="form-note">
              Saved to PostgreSQL and shared with signed-in team members. Use
              sample or non-sensitive material while exploring.
            </p>
          </form>
        </section>
      </div>
    </>
  );
}
