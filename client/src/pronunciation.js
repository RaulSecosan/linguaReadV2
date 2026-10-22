export function selectVoice(voices, lang) {
  const wanted = lang.toLowerCase().replace('_', '-'), language = wanted.split('-')[0];
  return voices.filter((voice) => String(voice.lang).toLowerCase().replace('_', '-').split('-')[0] === language)
    .sort((a, b) => score(b) - score(a))[0];
  function score(voice) {
    return (voice.lang.toLowerCase().replace('_', '-') === wanted ? 100 : 0) + (voice.localService ? 10 : 0) + (voice.default ? 1 : 0);
  }
}
const errorText = (code) => ({
  'not-allowed': 'Browserul a blocat pronuntia. Apasa din nou pe difuzor.',
  'language-unavailable': 'Vocea pentru aceasta limba nu este disponibila pe telefon.',
  'voice-unavailable': 'Vocea aleasa nu este disponibila. Apasa din nou pe difuzor.',
  'audio-busy': 'Sunetul este folosit de alta aplicatie. Opreste redarea de acolo si incearca din nou.',
}[code] || 'Pronuntia nu a putut porni. Verifica volumul media si modul silentios, apoi apasa din nou pe difuzor.');

// Keep the utterance alive and start synchronously inside the user's button click.
export function createPronouncer(browser, { startTimeout = 6000 } = {}) {
  const synth = browser.speechSynthesis;
  let current = null, voices = [];
  function refreshVoices() { try { voices = synth?.getVoices() || []; } catch { voices = []; } }
  refreshVoices();
  synth?.addEventListener?.('voiceschanged', refreshVoices);
  function stop() { if (current) current.finish(null, true); }
  function speak(text, lang = 'en-US', { onState = () => {} } = {}) {
    if (!synth || !browser.SpeechSynthesisUtterance) return Promise.reject(new Error('Pronuntia nu este disponibila in acest browser.'));
    if (!String(text || '').trim()) return Promise.resolve();
    const hadCurrent = Boolean(current);
    stop();
    // Avoid cancelling an idle engine immediately before its first iPhone utterance.
    if (!hadCurrent && (synth.speaking || synth.pending)) synth.cancel();
    refreshVoices();
    let previousSession, changedSession = false;
    try {
      if (browser.navigator?.audioSession) {
        previousSession = browser.navigator.audioSession.type;
        browser.navigator.audioSession.type = 'playback'; changedSession = true;
      }
    } catch { /* AudioSession is optional; keep native speech available elsewhere. */ }
    const utterance = new browser.SpeechSynthesisUtterance(String(text).trim());
    utterance.lang = lang; utterance.rate = .92; utterance.pitch = 1; utterance.volume = 1;
    const voice = selectVoice(voices, lang);
    if (voice) utterance.voice = voice;
    let resolve, reject, timer, finished = false;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const state = { utterance, finish };
    current = state;
    function finish(error, cancel = false) {
      if (finished) return;
      finished = true; browser.clearTimeout(timer);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      if (current === state) current = null;
      if (cancel) synth.cancel();
      try {
        if (changedSession && browser.navigator.audioSession.type === 'playback') browser.navigator.audioSession.type = previousSession;
      } catch { /* Session ownership may have changed while the voice was playing. */ }
      onState(error ? 'error' : 'idle');
      if (error) reject(error); else resolve();
    }
    utterance.onstart = () => { browser.clearTimeout(timer); onState('speaking'); };
    utterance.onend = () => finish();
    utterance.onerror = (event) => finish(new Error(errorText(event.error)));
    onState('starting');
    timer = browser.setTimeout(() => finish(new Error(errorText('timeout')), true), startTimeout);
    try {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
      if (synth.paused) synth.resume();
    } catch (error) { finish(new Error(errorText(error?.name))); }
    return promise;
  }
  return { speak, stop, get activeUtterance() { return current?.utterance || null; }, destroy() { stop(); synth?.removeEventListener?.('voiceschanged', refreshVoices); } };
}
let pronouncer;
export function preparePronunciation() { pronouncer ||= createPronouncer(window); return pronouncer; }
export function pronounce(text, lang, callbacks) { return preparePronunciation().speak(text, lang, callbacks); }
