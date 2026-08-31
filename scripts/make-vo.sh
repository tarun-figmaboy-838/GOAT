#!/usr/bin/env bash
# ============================================================================
# Fence the Farm — generate the narration with ElevenLabs
#
# The words live in lab/js/game.js (this.VO) and are mirrored in
# lab/assets/vo/SCRIPT.md. This script is the third copy and the one that is
# actually spoken, so if a line changes in the game, change it here and re-run.
#
#   ./scripts/make-vo.sh [voice_id]
#
# THE KEY IS NEVER PASSED ON THE COMMAND LINE and never printed. It is read
# from, in order:
#     $ELEVENLABS_KEY
#     ~/.elevenlabs-key          (chmod 600; outside the repo, so it cannot be
#                                 committed even by accident)
# The voice id may be given as $1, or in ~/.elevenlabs-voice.
#
# Re-running only regenerates lines whose MP3 is missing, so a single re-record
# costs one line's credits. Pass --force to redo everything.
# ============================================================================
set -u

OUT="$(cd "$(dirname "$0")/.." && pwd)/lab/assets/vo"
FORCE=""
[ "${1:-}" = "--force" ] && { FORCE=1; shift; }

KEY="${ELEVENLABS_KEY:-}"
[ -z "$KEY" ] && [ -f "$HOME/.elevenlabs-key" ] && KEY="$(tr -d '\r\n' < "$HOME/.elevenlabs-key")"
VOICE="${1:-}"
[ -z "$VOICE" ] && [ -f "$HOME/.elevenlabs-voice" ] && VOICE="$(tr -d '\r\n' < "$HOME/.elevenlabs-voice")"

if [ -z "$KEY" ]; then
  echo "No API key. Put it in ~/.elevenlabs-key (chmod 600) or export ELEVENLABS_KEY." >&2
  exit 1
fi
if [ -z "$VOICE" ]; then
  echo "No voice id. Pass it as an argument or put it in ~/.elevenlabs-voice." >&2
  echo "List your voices with:" >&2
  echo "  curl -s -H \"xi-api-key: \$(cat ~/.elevenlabs-key)\" https://api.elevenlabs.io/v1/voices" >&2
  exit 1
fi

mkdir -p "$OUT"

# file|line  — one narrator, sixteen lines, in the order they are first heard.
LINES='
hook.mp3|How much grass can one fence hold? Let us find out.
reason.mp3|This is her field. You have twenty metres of fence — see how much grass you can give her.
perimeter.mp3|This is the perimeter. Twenty metres of fence, all the way around, and it never changes.
area.mp3|And this is the area — all the grass inside. Count the squares.
drag.mp3|Drag that corner, and watch what happens.
noticed.mp3|Look at that. More grass — and still exactly twenty metres of fence.
more.mp3|Try another shape.
challenge.mp3|Now find the biggest field you can.
nice.mp3|That is the biggest it gets. Same fence, more grass.
longer.mp3|Hmm. Longer did not mean more grass.
record.mp3|See if you can beat the farm record.
stretch.mp3|Here is an idea. Try making the field longer.
did-longer.mp3|Longer field. Less grass. Now find the most.
exact.mp3|Exactly forty-eight. Nice and precise.
master.mp3|Master build.
final.mp3|Same fence. Different area.
'

ok=0; skip=0; fail=0
while IFS='|' read -r file text; do
  [ -z "${file:-}" ] && continue
  dest="$OUT/$file"
  if [ -z "$FORCE" ] && [ -s "$dest" ]; then
    echo "  skip   $file (already recorded)"; skip=$((skip+1)); continue
  fi

  # Build the body with a heredoc so the line needs no shell escaping. None of
  # the lines contain a double quote; if one ever does, escape it here.
  body=$(cat <<JSON
{"text":"$text",
 "model_id":"eleven_multilingual_v2",
 "voice_settings":{"stability":0.45,"similarity_boost":0.80,"style":0.15,"use_speaker_boost":true}}
JSON
)

  code=$(curl -s -w '%{http_code}' -o "$dest.tmp" --max-time 120 \
    -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE?output_format=mp3_44100_128" \
    -H "xi-api-key: $KEY" \
    -H "Content-Type: application/json" \
    --data-binary "$body")

  size=$(stat -c%s "$dest.tmp" 2>/dev/null || echo 0)
  # A failure comes back as JSON with a 200-ish size; a real take is tens of KB
  # and starts with an MP3 frame or an ID3 tag.
  head2=$(head -c 3 "$dest.tmp" 2>/dev/null | tr -d '\0')
  if [ "$code" = "200" ] && [ "$size" -gt 4000 ] && { [ "$head2" = "ID3" ] || [ "${head2:0:1}" = "ÿ" ]; }; then
    mv "$dest.tmp" "$dest"
    printf "  ok     %-16s %6s KB\n" "$file" "$((size/1024))"
    ok=$((ok+1))
  else
    echo "  FAIL   $file  (http $code, $size bytes)"
    [ "$size" -lt 2000 ] && sed 's/^/         /' "$dest.tmp" 2>/dev/null | head -3
    rm -f "$dest.tmp"; fail=$((fail+1))
  fi
done <<< "$LINES"

echo
echo "recorded $ok, skipped $skip, failed $fail  ->  $OUT"
[ "$fail" -gt 0 ] && exit 1
exit 0
