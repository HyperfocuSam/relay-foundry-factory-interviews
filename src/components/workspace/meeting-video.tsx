"use client";
import { LiveKitRoom, VideoConference, useChat, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { MeetingAudioTrack } from "@/lib/meeting-audio";
import { useEffect, useRef } from "react";
import { ChatCaptureCursor, type CapturedChatMessage } from "@/lib/meeting-chat";
import "@livekit/components-styles";

function MicrophoneTracks({ onTracks }: { onTracks: (tracks: MeetingAudioTrack[]) => void }) {
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  useEffect(() => {
    onTracks(tracks.flatMap(({ participant, publication }) => {
      const track = publication.track?.mediaStreamTrack;
      return track && !publication.isMuted && track.readyState === "live"
        ? [{ id: `${participant.identity}:${publication.trackSid}:${track.id}`, speaker: participant.name || "Anonymous", track }] : [];
    }));
  }, [tracks, onTracks]);
  useEffect(() => () => onTracks([]), [onTracks]);
  return null;
}

function ChatCapture({ capturing, onMessages }: {
  capturing: boolean;
  onMessages: (messages: CapturedChatMessage[]) => void;
}) {
  const { chatMessages } = useChat();
  const cursor = useRef(new ChatCaptureCursor());
  useEffect(() => {
    const incoming = cursor.current.read(chatMessages.map((entry) => ({
        id: `${entry.from?.identity ?? "unknown"}:${entry.id}`,
        timestamp: entry.timestamp,
        speaker: entry.from?.name || "Anonymous",
        message: entry.message,
      })), capturing);
    if (incoming.length) onMessages(incoming);
  }, [chatMessages, capturing, onMessages]);
  return null;
}

export default function MeetingVideo({
  token,
  serverUrl,
  onLeave,
  onError,
  capturing,
  onMessages,
  onAudioTracks,
}: {
  token: string;
  serverUrl: string;
  onLeave: () => void;
  onError: () => void;
  capturing: boolean;
  onMessages: (messages: CapturedChatMessage[]) => void;
  onAudioTracks: (tracks: MeetingAudioTrack[]) => void;
}) {
  return (
    <div className="meeting-video-frame">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={false}
        video={false}
        onDisconnected={onLeave}
        onError={onError}
        onMediaDeviceFailure={onError}
        data-lk-theme="default"
        className="meeting-video"
      >
        <ChatCapture capturing={capturing} onMessages={onMessages} />
        <MicrophoneTracks onTracks={onAudioTracks} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
