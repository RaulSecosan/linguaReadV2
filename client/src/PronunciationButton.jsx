import React, { useEffect, useRef, useState } from 'react';
import { pronounce } from './pronunciation.js';
export default function PronunciationButton({ text, lang = 'en-US', className, title, children }) {
  const [state, setState] = useState('idle');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <button type="button" className={className} title={title} aria-label={title}
    aria-busy={state === 'starting'} data-speech-state={state}
    onClick={(event) => {
      event.stopPropagation();
      // No await, timer or React effect before speak: preserve the tap's activation.
      pronounce(text, lang, { onState: (next) => { if (mounted.current) setState(next); } })
        .catch((error) => window.dispatchEvent(new CustomEvent('lr-pronunciation-error', { detail: error.message })));
    }}>{children}</button>;
}
