export type MeetingAudioTrack = { id: string; speaker: string; track: MediaStreamTrack };
export type AudioClip = { id: string; speaker: string; timestamp: number; audio: Blob };

// Each participant gets an independent, complete media container. Timeslice blobs
// are not uploaded separately: later WebM fragments may lack a decodable header.
export class MeetingAudioRecorder {
  private active = new Map<string, { recorder: MediaRecorder; done: Promise<void> }>();
  private draining = new Set<Promise<void>>();
  private onClip: (clip: AudioClip) => void;
  private onError: (message: string) => void;
  constructor(onClip: (clip: AudioClip) => void, onError: (message: string) => void) {
    this.onClip = onClip;
    this.onError = onError;
  }

  sync(tracks: MeetingAudioTrack[]) {
    const ids = new Set(tracks.map((track) => track.id));
    for (const [id, entry] of this.active) if (!ids.has(id)) {
      if (entry.recorder.state !== "inactive") entry.recorder.stop();
      this.active.delete(id);
    }
    for (const track of tracks) {
      if (this.active.has(track.id) || track.track.readyState !== "live") continue;
      try {
        const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]
          .find((type) => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error("This browser cannot record supported audio. Use a current Chrome, Edge, Firefox or Safari browser.");
        const recorder = new MediaRecorder(new MediaStream([track.track]), { mimeType, audioBitsPerSecond: 64_000 });
        const chunks: Blob[] = [];
        const timestamp = Date.now();
        const clipId = crypto.randomUUID();
        let finish!: () => void;
        const done = new Promise<void>((resolve) => { finish = resolve; });
        this.draining.add(done);
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => this.onError("Audio capture failed. Stop capture and keep the available draft.");
        recorder.onstop = () => {
          try {
            if (chunks.length) this.onClip({ id: clipId, speaker: track.speaker, timestamp,
              audio: new Blob(chunks, { type: mimeType.split(";")[0] }) });
          } finally {
            if (this.active.get(track.id)?.recorder === recorder) this.active.delete(track.id);
            this.draining.delete(done);
            finish();
          }
        };
        try { recorder.start(); } catch (error) { this.draining.delete(done); finish(); throw error; }
        this.active.set(track.id, { recorder, done });
      } catch (error) {
        this.onError(error instanceof Error ? error.message : "Could not capture microphone audio.");
        return;
      }
    }
  }

  async stop() {
    for (const { recorder } of this.active.values()) if (recorder.state !== "inactive") recorder.stop();
    this.active.clear();
    await Promise.all([...this.draining]);
    // Never stop the source MediaStreamTrack: it belongs to the LiveKit call.
  }
}
