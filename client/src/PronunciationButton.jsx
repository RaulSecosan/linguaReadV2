import React, { useEffect, useRef, useState } from 'react';
import { pronounce, usesRecordedPronunciation } from './pronunciation.js';
import { createAudioTap } from './audioTap.js';
export default function PronunciationButton({ text, lang = 'en-US', className, title, children }) {
  const [state, setState] = useState('idle'), [pressed, setPressed] = useState(false), [feedback, setFeedback] = useState(false);
  const mounted = useRef(true), timer = useRef(null), activate = useRef(null), tap = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
  activate.current = () => {
    setFeedback(true); clearTimeout(timer.current); timer.current = setTimeout(() => { if (mounted.current) setFeedback(false); }, 900);
    // Directly in pointerup/touchend/click, retaining the gesture's media permission.
    pronounce(text, lang, { onState: (next) => { if (mounted.current) setState(next); } })
      .catch((error) => window.dispatchEvent(new CustomEvent('lr-pronunciation-error', { detail: error.message })));
  };
  tap.current ||= createAudioTap(() => activate.current());
  const ai = usesRecordedPronunciation();
  return <button type="button" className={`${className} pronunciation-button`} title={ai ? `${title} · Voce generata AI` : title} aria-label={title}
    aria-busy={state === 'starting'} data-speech-state={state} data-pressed={pressed} data-feedback={feedback}
    onPointerDown={(event) => { setPressed(true); tap.current.down(event); }}
    onPointerMove={(event) => tap.current.move(event)}
    onPointerCancel={() => { setPressed(false); tap.current.cancel(); }}
    onPointerUp={(event) => { event.stopPropagation(); setPressed(false); if (event.pointerType === 'touch' || event.pointerType === 'pen') tap.current.end(event); }}
    onTouchStart={(event) => { const p = event.touches[0]; if (p) { setPressed(true); tap.current.down(p); } }}
    onTouchMove={(event) => { if (event.touches[0]) tap.current.move(event.touches[0]); }}
    onTouchCancel={() => { setPressed(false); tap.current.cancel(); }}
    onTouchEnd={(event) => { event.stopPropagation(); setPressed(false); if (event.changedTouches[0]) tap.current.end(event.changedTouches[0]); }}
    onClick={(event) => { event.stopPropagation(); tap.current.click(event.detail === 0); }}>
      {state === 'starting' ? <span className="pronunciation-spinner" aria-hidden="true" /> : children}
      {ai && <span className="pronunciation-ai-badge">Voce AI</span>}
    </button>;
}
