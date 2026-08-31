/* Fence the Farm — bootstrap.
   ?debug=1 opens the debug navigator, ?round=3 starts on a given farm.
   Narration plays whenever a recording exists in assets/vo/; ?novo=1 silences
   it and ?tts=1 falls back to the browser's own voice for timing a line that
   has not been recorded yet. */
var params = new URLSearchParams(location.search);
window.game = new FenceTheFarm({
  snapGuide: 'On drag',            // 'Always' | 'Never'
  audio: true,
  music: true,
  vo: !params.has('novo'),         // recordings play when present; see assets/vo/SCRIPT.md
  tts: params.has('tts'),          // browser speech, for timing a line before it exists
  debugMode: params.has('debug'),
  startRound: Number(params.get('round') || 1)
});
