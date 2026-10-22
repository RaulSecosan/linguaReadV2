import React, { useState } from 'react';
import { Pencil, Plus, Check } from 'lucide-react';
import { journalEntries } from '../../shared/journal.mjs';
import { DATA_PROVIDER } from './api.js';

export default function DailyJournal({ date, day, onSave, loading, loadError, onRetry }) {
  const draftKey = `lr-journal-draft:${DATA_PROVIDER}:${date}`;
  const empty = () => ({ id: crypto.randomUUID(), text: '', time: '' });
  const [draft, setDraft] = useState(() => {
    try { return JSON.parse(localStorage.getItem(draftKey)) || empty(); } catch { return empty(); }
  });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const entries = journalEntries(day);
  const editing = Boolean(day?.entries?.[draft.id]);
  function change(next) {
    setDraft(next); setMessage(''); setError('');
    try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* Cloud saving remains available. */ }
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !draft.text.trim()) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await onSave(date, draft);
      try { localStorage.removeItem(draftKey); } catch { /* Optional draft storage. */ }
      setDraft(empty()); setMessage('Insemnare salvata.');
    } catch (error) { setError(`Nu s-a salvat: ${error.message} Textul ramane in ciorna.`); }
    finally { setBusy(false); }
  }
  const label = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
  return <section className="daily-journal" aria-label={`Jurnal ${date}`}>
    <div className="section-heading compact"><div><span className="eyebrow">Jurnal personal</span><h3>{label}</h3></div></div>
    {loading && <p role="status">Se incarca insemnarile...</p>}
    {loadError && <div className="quiz-error" role="alert">{loadError} <button type="button" className="secondary-button" onClick={onRetry}>Reincearca</button></div>}
    {!loading && !loadError && !entries.length && <p className="journal-empty">Ce ai realizat astazi? Poti nota si activitati fara ora.</p>}
    <ol className="journal-entries">
      {entries.map((entry) => <li key={entry.id}>
        <span className="journal-time">{entry.time || 'Fara ora'}</span>
        <p>{entry.text}</p>
        <button type="button" className="icon-button" title="Editeaza insemnarea" aria-label={`Editeaza insemnarea ${entry.time || 'fara ora'}`} disabled={busy || Boolean(draft.text.trim())}
          onClick={() => change({ id: entry.id, text: entry.text, time: entry.time })}><Pencil size={16} /></button>
      </li>)}
    </ol>
    <form onSubmit={save}>
      <label>Ce ai realizat?<textarea aria-label="Ce ai realizat?" rows={3} maxLength={10000} value={draft.text} disabled={busy}
        placeholder="Am citit un capitol, am exersat cuvinte noi..." onChange={(event) => change({ ...draft, text: event.target.value })} /></label>
      <div className="journal-actions">
        <label>Ora (optional)<input type="time" aria-label="Ora (optional)" value={draft.time} disabled={busy} onInput={(event) => change({ ...draft, time: event.currentTarget.value })} onChange={(event) => change({ ...draft, time: event.target.value })} /></label>
        <button className="primary-button" disabled={busy || loading || Boolean(loadError) || !draft.text.trim()}>
          {editing ? <Check size={16} /> : <Plus size={16} />}{busy ? 'Se salveaza...' : editing ? 'Salveaza modificarile' : 'Adauga in jurnal'}
        </button>
        {editing && <button type="button" className="secondary-button" disabled={busy} onClick={() => { change(empty()); }}>Renunta la editare</button>}
      </div>
    </form>
    {error && <p className="quiz-error" role="alert">{error}</p>}
    <p className="journal-save-status" role="status">{message}</p>
  </section>;
}
