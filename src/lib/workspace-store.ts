"use client";

import { useSyncExternalStore } from "react";
import { parseSessions, type Session } from "./interviews";
export const STORAGE_KEY = "factory-interviews.workspace.v1";
type Snapshot = { sessions: Session[]; loaded: boolean; error: string | null };
const serverSnapshot: Snapshot = { sessions: [], loaded: false, error: null };
let snapshot = serverSnapshot;
let loading: Promise<void> | undefined;
let saving = false;
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
async function request(method: string, body?: unknown) {
  const response = await fetch("/api/sessions", {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ||
        "Unable to save this change. Keep your draft and try again.",
    );
  return result;
}
async function load() {
  try {
    const result = await request("GET");
    snapshot = {
      sessions: parseSessions(JSON.stringify(result)),
      loaded: true,
      error: null,
    };
  } catch (error) {
    snapshot = {
      ...snapshot,
      loaded: true,
      error:
        error instanceof Error
          ? error.message
          : "Cannot connect to the workspace. Reload to retry.",
    };
  }
  emit();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loading) loading = load();
  return () => {
    listeners.delete(listener);
  };
}
export function useWorkspace() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
}
async function mutate(method: string, value: unknown) {
  if (saving)
    throw new Error(
      "A save is in progress. Wait for it to finish before saving another change.",
    );
  saving = true;
  try {
    const result = await request(method, value);
    const id = (value as { id: string }).id;
    snapshot = {
      sessions: result.session
        ? [
            result.session,
            ...snapshot.sessions.filter((session) => session.id !== id),
          ]
        : snapshot.sessions.filter((session) => session.id !== id),
      loaded: true,
      error: null,
    };
    emit();
  } finally {
    saving = false;
  }
}
export async function addSession(session: Session) {
  await mutate("POST", session);
}
export async function updateSession(
  id: string,
  revision: number,
  change: (session: Session) => Session,
) {
  const current = snapshot.sessions.find((session) => session.id === id);
  if (!current || current.revision !== revision)
    throw new Error("Session changed. Keep your draft and reload.");
  await mutate("PUT", { ...change(current), id, revision });
}
export async function removeSession(id: string, revision: number) {
  await mutate("DELETE", { id, revision });
}
export async function importLocalSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("No legacy browser interviews were found.");
  const sessions = parseSessions(raw);
  for (const session of sessions) {
    if (!snapshot.sessions.some((saved) => saved.id === session.id))
      await addSession(session);
  }
  // Preserve the original local copy, including after partial failures.
}
export function downloadFile(
  name: string,
  content: string,
  type = "text/markdown;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadRecovery() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (snapshot.error && raw) {
    downloadFile(
      "factory-interviews-local-recovery.json",
      raw,
      "application/json",
    );
    return;
  }
  if (snapshot.error || !snapshot.loaded)
    throw new Error("Load the workspace before exporting.");
  downloadFile(
    "factory-interviews-backup.json",
    JSON.stringify({ version: 1, sessions: snapshot.sessions }, null, 2),
    "application/json",
  );
}
