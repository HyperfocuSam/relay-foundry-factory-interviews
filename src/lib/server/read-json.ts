import { RequestError } from "./session-repository";
export async function readJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RequestError("Request exceeds the size limit.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Invalid JSON.");
  }
}
