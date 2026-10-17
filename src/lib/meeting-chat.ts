export type CapturedChatMessage = {
  id: string;
  timestamp: number;
  speaker: string;
  message: string;
};

export const CHAT_SOURCE_LIMIT = 50_000;

export class ChatCaptureCursor {
  private seen = new Map<string, string>();
  private eligible = new Set<string>();

  read(messages: CapturedChatMessage[], capturing: boolean) {
    if (!capturing) this.eligible.clear();
    const incoming: CapturedChatMessage[] = [];
    for (const entry of messages) {
      if (!this.seen.has(entry.id) && capturing) this.eligible.add(entry.id);
      const changed = this.seen.get(entry.id) !== entry.message;
      this.seen.set(entry.id, entry.message);
      if (capturing && changed && this.eligible.has(entry.id)) incoming.push(entry);
    }
    return incoming;
  }
}

export function chatTranscript(messages: CapturedChatMessage[]) {
  return messages.map((entry) => {
    const speaker = entry.speaker.replace(/[\r\n]/g, " ").trim() || "Anonymous";
    // One paragraph per message keeps citations aligned with the original chat.
    const text = entry.message.replace(/\r\n?/g, "\n").replace(/\n\s*\n/g, "\n");
    return `[${new Date(entry.timestamp).toISOString()}] ${speaker}: ${text}`;
  }).join("\n\n");
}

export function appendChatMessages(
  current: CapturedChatMessage[],
  incoming: CapturedChatMessage[],
) {
  const next = [...current];
  for (const entry of incoming) {
    if (!entry.message.trim()) continue;
    if (!Number.isFinite(entry.timestamp) || Number.isNaN(new Date(entry.timestamp).getTime()))
      throw new Error("A chat message has an invalid timestamp. Capture stopped; keep your draft.");
    const index = next.findIndex((saved) => saved.id === entry.id);
    if (index === -1) next.push({ ...entry });
    else next[index] = { ...next[index], message: entry.message };
  }
  if (chatTranscript(next).length > CHAT_SOURCE_LIMIT)
    throw new Error("Chat capture reached the 50,000-character source limit. Save this part, then start another capture. The latest messages were not captured.");
  return next;
}
