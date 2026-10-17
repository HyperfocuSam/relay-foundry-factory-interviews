# Sourced by deploy.sh before any Kubernetes writes.
# Provider-specific names take precedence over legacy Qwen/Bifrost aliases.
QWEN_BASE_URL=${QWEN_BASE_URL:-${LLM_BASE_URL:-}}
QWEN_MODEL=${QWEN_MODEL:-${LLM_MODEL:-}}
QWEN_BIFROST_VIRTUAL_KEY=${QWEN_BIFROST_VIRTUAL_KEY:-${BIFROST_VIRTUAL_KEY:-}}
AI_ANALYSIS_PROVIDER=${AI_ANALYSIS_PROVIDER:-}

if [ -z "$AI_ANALYSIS_PROVIDER" ]; then
  case "${LLM_PROVIDER:-}" in
    bifrost) AI_ANALYSIS_PROVIDER=qwen ;;
    gemini) AI_ANALYSIS_PROVIDER=gemini ;;
    '')
      if [ -n "$QWEN_BASE_URL$QWEN_MODEL$QWEN_BIFROST_VIRTUAL_KEY" ]; then
        AI_ANALYSIS_PROVIDER=qwen
      elif [ -n "${GEMINI_API_KEY:-}${GEMINI_MODEL:-}" ]; then
        AI_ANALYSIS_PROVIDER=gemini
      fi
      ;;
    *) echo 'Legacy LLM_PROVIDER must be bifrost or gemini.' >&2; exit 1 ;;
  esac
fi
case "$AI_ANALYSIS_PROVIDER" in
  ''|qwen|gemini) ;;
  *) echo 'AI_ANALYSIS_PROVIDER must be qwen or gemini.' >&2; exit 1 ;;
esac

if [ -n "${GEMINI_API_KEY:-}${GEMINI_MODEL:-}" ] || [ "$AI_ANALYSIS_PROVIDER" = gemini ]; then
  : "${GEMINI_API_KEY:?Set the Gemini API key}"
  : "${GEMINI_MODEL:?Set a Gemini model supporting structured text output}"
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
if [ -n "$QWEN_BASE_URL$QWEN_MODEL$QWEN_BIFROST_VIRTUAL_KEY" ] || [ "$AI_ANALYSIS_PROVIDER" = qwen ]; then
  : "${QWEN_BASE_URL:?Set the Qwen Bifrost base URL ending in /v1}"
  : "${QWEN_MODEL:?Set the Qwen provider/model route}"
  : "${QWEN_BIFROST_VIRTUAL_KEY:?Set the Qwen Bifrost virtual key}"
fi

# Keep runtime aliases synchronized for older images and rollbacks.
LLM_BASE_URL=$QWEN_BASE_URL
LLM_MODEL=$QWEN_MODEL
BIFROST_VIRTUAL_KEY=$QWEN_BIFROST_VIRTUAL_KEY
case "$AI_ANALYSIS_PROVIDER" in
  qwen) LLM_PROVIDER=bifrost ;;
  gemini) LLM_PROVIDER=gemini ;;
  '') LLM_PROVIDER= ;;
esac
