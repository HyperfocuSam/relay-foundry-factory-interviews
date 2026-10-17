"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { newId, type Source } from "@/lib/interviews";
import { appendChatMessages, chatTranscript, type CapturedChatMessage } from "@/lib/meeting-chat";
import { downloadFile } from "@/lib/workspace-store";
import { MeetingSpeech } from "./meeting-speech";
import type { MeetingAudioTrack } from "@/lib/meeting-audio";
const ConnectedMeeting = dynamic(() => import("./meeting-video"), {
  ssr: false,
  loading: () => <p role="status">Opening meeting controls…</p>,
});

export function MeetingRoom({
  sessionId,
  reviewer,
  onSaveChat,
}: {
  sessionId: string;
  reviewer: string;
  onSaveChat: (source: Source) => Promise<boolean>;
}) {
  const nameId = useId();
  const [displayName, setDisplayName] = useState("Anonymous");
  const [connection, setConnection] = useState<{
    token: string;
    serverUrl: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioTracks, setAudioTracks] = useState<MeetingAudioTrack[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<CapturedChatMessage[]>([]);
  const capturedRef = useRef<CapturedChatMessage[]>([]);
  const [savingChat, setSavingChat] = useState(false);
  const captureActive = useRef(false);
  const receiveMessages = useCallback((incoming: CapturedChatMessage[]) => {
    if (!captureActive.current) return;
    try {
      const next = appendChatMessages(capturedRef.current, incoming);
      capturedRef.current = next;
      setCaptured(next);
    } catch (error) {
      captureActive.current = false;
      setCapturing(false);
      setError(error instanceof Error ? error.message : "Chat capture failed. Keep your draft.");
    }
  }, []);
  useEffect(() => {
    if (!captured.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [captured.length]);
  async function saveChat() {
    if (savingChat || capturing || !capturedRef.current.length) return;
    setSavingChat(true);
    setError("");
    const source: Source = {
      id: newId(),
      kind: "transcript",
      label: `Meeting chat · ${new Date(capturedRef.current[0].timestamp).toISOString()}`,
      content: chatTranscript(capturedRef.current),
      addedAt: new Date().toISOString(),
    };
    try {
      if (await onSaveChat(source)) {
        capturedRef.current = [];
        setCaptured([]);
        setConsent(false);
        setMessage("Chat saved to this session. Open Session review and select the meeting chat source for AI analysis.");
      } else {
        setError("Chat was not confirmed saved. Your draft is still here. Download a backup before reloading, then import it as a transcript if needed.");
      }
    } catch {
      setError("Chat could not be saved. Your draft is still here; retry or download a backup.");
    } finally {
      setSavingChat(false);
    }
  }
  async function join() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/meetings/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, displayName: displayName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConnection(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not join the meeting.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="meeting-panel" aria-label="Interview meeting">
      {connection ? (
        <ConnectedMeeting
          {...connection}
          capturing={capturing}
          onMessages={receiveMessages}
          onAudioTracks={setAudioTracks}
          onLeave={() => {
            captureActive.current = false;
            setCapturing(false);
            setConnection(null);
            setAudioTracks([]);
            setMessage(
              "You left the meeting. Your saved notes are still here.",
            );
          }}
          onError={() =>
            setError(
              "The call could not connect or access your device. Check permissions and your connection, or leave and retry.",
            )
          }
        />
      ) : (
        <div className="interview-stage">
          <span className="badge dark-badge">Your interview room</span>
          <div className="stage-avatar" aria-hidden="true">
            {reviewer.slice(0, 1).toUpperCase()}
          </div>
          <h2>
            A conversation worth
            <br />
            understanding.
          </h2>
          <p>
            Meet with your team, follow the prompts,
            <br />
            and capture what matters.
          </p>
          <form className="meeting-join-form" onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void join();
          }}>
            <div className="field">
              <label htmlFor={nameId}>Your name in this meeting</label>
              <input
                id={nameId}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                required
                disabled={busy}
                aria-describedby={`${nameId}-help`}
              />
              <small id={`${nameId}-help`}>
                Others see this name. Use a name or join as Anonymous.
              </small>
            </div>
            <button className="button" type="submit" disabled={busy || !displayName.trim()}>
              {busy ? "Joining…" : "Join meeting"}
            </button>
          </form>
          <p className="form-note">
            Camera and microphone start off. Turn them on when you are ready.
          </p>
        </div>
      )}
      <MeetingSpeech sessionId={sessionId} connected={!!connection} tracks={audioTracks} onSave={onSaveChat} />
      {(connection || captured.length > 0) && (
        <div className="meeting-capture-panel">
          <h3>Save meeting chat</h3>
          <p className="form-note">
            Capture new text messages received by this browser, then save them as evidence for review.
            Names are attendee labels. This control captures typed chat only; use speech capture above for microphone audio.
          </p>
          {connection && !capturing && (
            <label className="meeting-capture-consent">
              <input type="checkbox" checked={consent} disabled={savingChat}
                onChange={(event) => setConsent(event.target.checked)} />
              I have told participants and they agree to save this chat in the team workspace.
            </label>
          )}
          <div className="meeting-capture-actions">
            {connection && (
              <button className="button secondary" disabled={savingChat || (!capturing && !consent)}
                onClick={() => {
                  captureActive.current = !capturing;
                  setCapturing(!capturing);
                  setMessage("");
                  setError("");
                }}>
                {capturing ? "Stop chat capture" : "Start chat capture"}
              </button>
            )}
            <button className="button" disabled={capturing || savingChat || !captured.length}
              onClick={() => void saveChat()}>
              {savingChat ? "Saving chat…" : "Save chat as source"}
            </button>
            {captured.length > 0 && (
              <button className="button secondary" onClick={() => downloadFile(
                `meeting-chat-${sessionId}.txt`, chatTranscript(capturedRef.current), "text/plain;charset=utf-8",
              )}>Download chat backup</button>
            )}
          </div>
          <p role="status" className="form-note">
            {capturing ? "Capturing chat" : "Chat capture stopped"} · {captured.length} unsaved messages.
            {captured.length > 0 && " Save or download before navigating away. Stop capture to save this part."}
          </p>
          {captured.length > 0 && (
            <details><summary>Preview captured chat</summary><pre className="meeting-chat-preview">{chatTranscript(captured)}</pre></details>
          )}
        </div>
      )}
      <div className="meeting-details">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${window.location.origin}/workspace/${sessionId}`,
              );
              setMessage(
                "Session link copied. Teammates need to sign in, then open this link.",
              );
            } catch {
              setError(
                "Could not copy the link. Copy this page’s address from your browser.",
              );
            }
          }}
        >
          Copy session link
        </button>
        <span className="form-note">
          Team members only · Speech capture requires participant agreement
        </span>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
