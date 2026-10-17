"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MeetingAudioRecorder, type AudioClip, type MeetingAudioTrack } from "@/lib/meeting-audio";
import { appendChatMessages, chatTranscript, type CapturedChatMessage } from "@/lib/meeting-chat";
import { newId, type Source } from "@/lib/interviews";
import { downloadFile } from "@/lib/workspace-store";

type ClipDraft = AudioClip & { status: "pending" | "failed" | "done"; error?: string };
async function audioBase64(audio: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the retained audio."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(audio);
  });
}

export function MeetingSpeech({ sessionId, connected, tracks, onSave }: {
  sessionId: string; connected: boolean; tracks: MeetingAudioTrack[];
  onSave: (source: Source) => Promise<boolean>;
}) {
  const [consent, setConsent] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [transcript, setTranscript] = useState<CapturedChatMessage[]>([]);
  const transcriptRef = useRef<CapturedChatMessage[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const recorder = useRef<MeetingAudioRecorder | null>(null);
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(new Set<string>());
  const onClipRef = useRef<(clip: AudioClip) => void>(() => {});
  const stop = useCallback(async () => {
    active.current = false;
    setCapturing(false);
    setStopping(true);
    if (timer.current) clearTimeout(timer.current);
    await recorder.current?.stop();
    setStopping(false);
  }, []);
  const transcribe = useCallback(async (clip: AudioClip) => {
    if (inFlight.current.has(clip.id)) return;
    inFlight.current.add(clip.id);
    setClips((current) => current.map((entry) => entry.id === clip.id ? { ...entry, status: "pending", error: undefined } : entry));
    try {
      if (clip.audio.size > 4_000_000) throw new Error("Audio exceeds the transcription limit. Download this part and capture shorter parts.");
      const response = await fetch("/api/meetings/transcribe", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(75000),
        body: JSON.stringify({ sessionId, consent: true, mimeType: clip.audio.type, audio: await audioBase64(clip.audio) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Transcription failed.");
      if (typeof result.text !== "string") throw new Error("Invalid transcription response.");
      const next = appendChatMessages(transcriptRef.current, [{ id: clip.id, speaker: clip.speaker,
        timestamp: clip.timestamp, message: result.text }]).sort((a, b) => a.timestamp - b.timestamp);
      transcriptRef.current = next;
      setTranscript(next);
      // Release successfully transcribed audio; only failed clips need retry/backup.
      setClips((current) => current.map((entry) => entry.id === clip.id ? { ...entry, status: "done", audio: new Blob() } : entry));
      if (!result.text.trim()) setMessage("No intelligible speech was detected in one audio part. Check that the microphone is enabled.");
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "Transcription failed. Retry your retained audio.";
      setClips((current) => current.map((entry) => entry.id === clip.id ? { ...entry, status: "failed", error: reason } : entry));
      setError(reason);
      void stop();
    } finally { inFlight.current.delete(clip.id); }
  }, [sessionId, stop]);
  useEffect(() => {
    onClipRef.current = (clip) => {
      setClips((current) => [...current, { ...clip, status: "pending" }]);
      void transcribe(clip);
    };
  }, [transcribe]);
  useEffect(() => {
    if (active.current) recorder.current?.sync(tracks);
  }, [tracks]);
  useEffect(() => {
    if (!connected && active.current) queueMicrotask(() => { void stop(); });
  }, [connected, stop]);
  useEffect(() => () => {
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    void recorder.current?.stop();
  }, []);
  const pending = clips.some((clip) => clip.status === "pending");
  const failed = clips.filter((clip) => clip.status === "failed");
  useEffect(() => {
    if (!capturing && !stopping && !pending && !transcript.length && !failed.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [capturing, stopping, pending, transcript.length, failed.length]);

  async function save() {
    if (capturing || stopping || pending || failed.length || saving || !transcriptRef.current.length) return;
    setSaving(true); setError("");
    try {
      const source: Source = { id: newId(), kind: "transcript", label: `Meeting speech (AI transcript) · ${new Date(transcriptRef.current[0].timestamp).toISOString()}`,
        content: chatTranscript(transcriptRef.current), addedAt: new Date().toISOString() };
      if (!await onSave(source)) throw new Error("Transcript was not confirmed saved. Keep or download your draft before reloading.");
      transcriptRef.current = []; setTranscript([]); setClips([]); setConsent(false);
      setMessage("Speech transcript saved. Open Session review and select this source for AI analysis.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your transcript draft is retained."); }
    finally { setSaving(false); }
  }
  if (!connected && !clips.length && !transcript.length) return null;
  return <div className="meeting-capture-panel">
    <h3>Capture interview speech</h3>
    <p className="form-note">Enable your microphone, then capture speech from this meeting. Audio is temporarily recorded in this browser and sent to Google Gemini for transcription. Video is excluded. Capture stops after two minutes; save each part and start another.</p>
    <p className="form-note">Only microphone tracks available to this browser are captured. Use one capturing browser. Attendee labels and part start times are supplied by this browser; AI transcripts may contain mistakes. Review the preview against your notes before saving.</p>
    {!capturing && connected && <label className="meeting-capture-consent"><input type="checkbox" checked={consent} disabled={pending || stopping || saving}
      onChange={(event) => setConsent(event.target.checked)} />I have told all participants and they agree to send meeting audio to Google Gemini and save the transcript in the team workspace.</label>}
    <div className="meeting-capture-actions">
      {connected && <button className="button secondary" disabled={stopping || saving || (!capturing && (!consent || pending || !!failed.length || !tracks.length))}
        onClick={() => {
          if (capturing) { void stop(); return; }
          setError(""); setMessage("");
          recorder.current = new MeetingAudioRecorder((clip) => onClipRef.current(clip), (reason) => { setError(reason); void stop(); });
          active.current = true; setCapturing(true); recorder.current.sync(tracks);
          if (active.current) timer.current = setTimeout(() => { setMessage("Two-minute capture ended. Wait for transcription, save this part, then start another."); void stop(); }, 120_000);
        }}>{capturing ? "Stop speech capture" : "Start speech capture"}</button>}
      <button className="button" disabled={capturing || stopping || pending || !!failed.length || saving || !transcript.length} onClick={() => void save()}>{saving ? "Saving transcript…" : "Save speech as source"}</button>
      {!!transcript.length && <button className="button secondary" onClick={() => downloadFile(`meeting-speech-${sessionId}.txt`, chatTranscript(transcriptRef.current), "text/plain;charset=utf-8")}>Download transcript backup</button>}
    </div>
    <p className="form-note" role="status">{capturing ? `Capturing ${tracks.length} microphone track(s)` : stopping ? "Finishing audio capture…" : pending ? "Transcribing audio…" : "Speech capture stopped"} · {transcript.length} unsaved transcript parts.{connected && !tracks.length && " Enable a microphone in the meeting controls to start."}</p>
    {!!transcript.length && <details open><summary>Preview speech transcript</summary><pre className="meeting-chat-preview">{chatTranscript(transcript)}</pre></details>}
    {failed.map((clip) => <div key={clip.id}><p role="alert">{clip.speaker}: {clip.error}</p><div className="meeting-capture-actions">
      <button className="button secondary" disabled={pending || stopping || capturing || saving} onClick={() => void transcribe(clip)}>Retry transcription</button>
      <button className="button secondary" onClick={() => {
        const url = URL.createObjectURL(clip.audio); const link = document.createElement("a");
        link.href = url; link.download = `meeting-audio-${clip.id}.${clip.audio.type === "audio/mp4" ? "m4a" : clip.audio.type === "audio/ogg" ? "ogg" : "webm"}`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download audio backup</button>
    </div></div>)}
    {message && <p role="status" className="notice">{message}</p>}
    {error && !failed.length && <p role="alert" className="notice error">{error}</p>}
  </div>;
}
