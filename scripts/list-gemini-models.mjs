import { pathToFileURL } from "node:url";

export async function listGeminiModels(key, send = fetch) {
  if (!key?.trim())
    throw new Error("Set GEMINI_API_KEY in .env.local or your shell environment first.");
  const models = new Set();
  const seen = new Set();
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let response;
    try {
      response = await send(url, {
        headers: { "x-goog-api-key": key.trim() },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("Could not reach Google's model API. Check network access and retry.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Google's model API returned HTTP ${response.status}. Check the key, API restrictions and project access.`);
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Google's model API returned an unreadable response.");
    }
    if (!result || !Array.isArray(result.models))
      throw new Error("Google's model API returned no model catalog.");
    for (const model of result.models) {
      if (typeof model?.name !== "string" ||
          !Array.isArray(model.supportedGenerationMethods) ||
          !model.supportedGenerationMethods.includes("generateContent")) continue;
      const name = model.name.replace(/^models\//, "");
      if (/^gemini-[a-zA-Z0-9.-]+$/.test(name)) models.add(name);
    }
    pageToken = result.nextPageToken;
    if (!pageToken) return [...models].sort();
    if (typeof pageToken !== "string" || seen.has(pageToken))
      throw new Error("Google's model API returned invalid pagination.");
    seen.add(pageToken);
  }
  throw new Error("Google's model catalog exceeded the pagination limit.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const models = await listGeminiModels(process.env.GEMINI_API_KEY);
    console.log("Gemini candidates supporting generateContent:\n");
    for (const model of models) console.log(model);
    if (!models.length) console.log("No matching Gemini models were returned.");
    console.log("\nA catalog listing does not verify audio capabilities or inference quota. Check the model's audio support and test it before selecting GEMINI_MODEL.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
