// Runs in the page's own JavaScript world (manifest "world": "MAIN"), because content scripts
// cannot see YouTube's player objects. It only answers requests from youtube-content.js with
// the caption track list of the video that is playing right now.
(function () {
  function currentPlayerResponse() {
    try {
      const player = document.getElementById('movie_player');
      const fromPlayer = player && typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
      if (fromPlayer && fromPlayer.videoDetails) return fromPlayer;
    } catch (_) {
      // fall through to the initial page data
    }
    return window.ytInitialPlayerResponse || null;
  }

  window.addEventListener('summary-ext:player-request', () => {
    const response = currentPlayerResponse();
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const payload = {
      videoId: response?.videoDetails?.videoId || null,
      title: response?.videoDetails?.title || null,
      captionTracks: tracks.map((t) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, kind: t.kind || null })),
    };
    // Strings cross the world boundary reliably; objects may not.
    window.dispatchEvent(new CustomEvent('summary-ext:player-response', { detail: JSON.stringify(payload) }));
  });
})();
