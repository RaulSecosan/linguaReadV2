export function isAppleTouchDevice(browser) {
  return /iPhone|iPad|iPod/.test(browser.navigator?.userAgent || '') || (browser.navigator?.platform === 'MacIntel' && browser.navigator?.maxTouchPoints > 1);
}
// play() must be called in the tap, before awaiting network/audio loading.
export function createRecordedPronouncer(browser, baseUrl, { startTimeout = 22000 } = {}) {
  const audio = new browser.Audio();
  audio.preload = 'none'; audio.crossOrigin = 'anonymous'; audio.volume = 1;
  audio.setAttribute('playsinline', '');
  let current = null;
  function stop() { current?.finish(null, true); }
  function speak(text, lang = 'en-US', { onState = () => {} } = {}) {
    stop();
    const url = new URL(`${baseUrl.replace(/\/$/, '')}/speech`);
    url.searchParams.set('text', String(text || '').trim()); url.searchParams.set('lang', lang);
    let resolve, reject, timer, finished = false, previousSession, changedSession = false;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const state = { finish }; current = state;
    try { if (browser.navigator?.audioSession) { previousSession = browser.navigator.audioSession.type; browser.navigator.audioSession.type = 'playback'; changedSession = true; } } catch { /* Optional API. */ }
    function finish(error, cancel = false) {
      if (finished) return;
      finished = true; browser.clearTimeout(timer);
      audio.onplaying = audio.onended = audio.onerror = null;
      if (cancel) audio.pause();
      if (current === state) current = null;
      try { if (changedSession && browser.navigator.audioSession.type === 'playback') browser.navigator.audioSession.type = previousSession; } catch { /* Session is optional. */ }
      onState(error ? 'error' : 'idle');
      if (error) reject(error); else resolve();
    }
    audio.onplaying = () => { browser.clearTimeout(timer); onState('speaking'); };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('Pronuntia audio nu a putut fi incarcata. Verifica internetul si apasa din nou pe difuzor.'));
    onState('starting');
    timer = browser.setTimeout(() => finish(new Error('Incarcarea pronuntiei dureaza prea mult. Apasa din nou pe difuzor.'), true), startTimeout);
    try {
      if (audio.src !== url.href) { audio.src = url.href; audio.load(); } else audio.currentTime = 0;
      audio.play()?.catch((error) => finish(new Error(error?.name === 'NotAllowedError' ? 'Redarea audio a fost blocata. Apasa din nou pe difuzor.' : 'Pronuntia audio nu a putut porni.')));
    } catch { finish(new Error('Pronuntia audio nu a putut porni.')); }
    return promise;
  }
  return { speak, stop, get activeAudio() { return current ? audio : null; } };
}
