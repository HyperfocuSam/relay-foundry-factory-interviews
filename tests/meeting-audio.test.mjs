import test from "node:test";
import assert from "node:assert/strict";
import { MeetingAudioRecorder } from "../src/lib/meeting-audio.ts";

test("recording follows available participant tracks, drains final audio, and never stops call tracks", async () => {
  const previous = { MediaRecorder: globalThis.MediaRecorder, MediaStream: globalThis.MediaStream };
  const created = [];
  globalThis.MediaStream = class { constructor(tracks) { this.tracks = tracks; } };
  globalThis.MediaRecorder = class {
    static isTypeSupported(type) { return type.startsWith("audio/webm"); }
    constructor(stream, options) { this.stream = stream; this.options = options; this.state = "inactive"; created.push(this); }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => { this.ondataavailable({ data: new Blob(["complete container"]) }); this.onstop(); });
    }
  };
  try {
    const clips = [];
    const recorder = new MeetingAudioRecorder((clip) => clips.push(clip), (error) => assert.fail(error));
    const track = (id, speaker) => ({ id, speaker, track: { readyState: "live", stop: () => assert.fail("Call track stopped") } });
    const alice = track("alice", "Alice"), bob = track("bob", "Bob");
    recorder.sync([alice]); recorder.sync([alice, bob]); recorder.sync([alice, bob]);
    assert.equal(created.length, 2, "Renders do not restart existing recorders");
    recorder.sync([bob]); // Alice muted or disconnected.
    await recorder.stop();
    assert.equal(clips.length, 2, "Stop includes the already draining removed track");
    assert.deepEqual(clips.map((clip) => clip.speaker).sort(), ["Alice", "Bob"]);
    assert.ok(clips.every((clip) => clip.audio.type === "audio/webm" && clip.audio.size > 0));
    assert.notEqual(clips[0].id, clips[1].id);
    recorder.sync([alice]); await recorder.stop();
    assert.equal(clips.length, 3, "Unmuting produces a new independent part");
  } finally { Object.assign(globalThis, previous); }
});
test("unsupported recording browsers report a visible error without accessing a new microphone", async () => {
  const previous = globalThis.MediaRecorder;
  globalThis.MediaRecorder = class { static isTypeSupported() { return false; } };
  try {
    const errors = [];
    const recorder = new MeetingAudioRecorder(() => assert.fail("Unexpected audio"), (error) => errors.push(error));
    recorder.sync([{ id: "alice", speaker: "Alice", track: { readyState: "live" } }]);
    await recorder.stop();
    assert.match(errors[0], /browser/);
  } finally { globalThis.MediaRecorder = previous; }
});
