# Gemini is the only inference provider. Ignore retired selector/Qwen variables.
if [ -n "${GEMINI_API_KEY:-}${GEMINI_MODEL:-}" ]; then
  : "${GEMINI_API_KEY:?Set the Gemini API key}"
  : "${GEMINI_MODEL:?Set an audio/text-capable Gemini model}"
  if ! printf '%s\n' "$GEMINI_MODEL" | grep -Eq '^gemini-[a-zA-Z0-9.-]+$'; then
    echo 'Invalid GEMINI_MODEL.' >&2; exit 1
  fi
fi
if [ -n "${GEMINI_BASE_URL:-}${GEMINI_GATEWAY_KEY:-}" ]; then
  : "${GEMINI_BASE_URL:?Set the Gemini gateway HTTPS API base URL}"
  : "${GEMINI_GATEWAY_KEY:?Set the dedicated Gemini gateway key}"
  case "$GEMINI_BASE_URL" in
    https://*) ;;
    *) echo 'GEMINI_BASE_URL must use HTTPS.' >&2; exit 1 ;;
  esac
fi
