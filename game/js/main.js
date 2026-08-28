/* Fence the Farm — bootstrap.
   ?debug=1 opens the debug navigator, ?round=3 starts on a given farm,
   ?vo=1 speaks the VO lines through the browser's own voice. */
var params = new URLSearchParams(location.search);
window.game = new FenceTheFarm({
  snapGuide: 'On drag',            // 'Always' | 'Never'
  audio: true,
  music: true,
  vo: params.has('vo'),            // recordings not supplied; see VO in game.js
  debugMode: params.has('debug'),
  startRound: Number(params.get('round') || 1)
});
