import type { AiPreference, LibraryAnswer, SavedItem } from '../../app/contracts.js';
import { SavedItemLink } from '../../components/SavedItemLink.js';

export function SelectedSavesQuestionPanel({
  sources,
  answerQuestion,
  onQuestionChange,
  aiPreference,
  answerError,
  answerBusy,
  answerResult,
  onClear,
  onRemove,
  onDisableAi,
  onSubmit,
}: {
  sources: SavedItem[];
  answerQuestion: string;
  onQuestionChange: (value: string) => void;
  aiPreference: AiPreference | null;
  answerError: string;
  answerBusy: boolean;
  answerResult: LibraryAnswer | null;
  onClear: () => void;
  onRemove: (item: SavedItem) => void;
  onDisableAi: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  if (sources.length === 0) return null;
  return <section className="library-ask-panel" aria-labelledby="library-ask-title">
    <div className="library-ask-heading"><div><p className="library-ask-kicker">Ask across saves</p><h2 id="library-ask-title">What do these saves have in common?</h2></div><button className="phase2-text-button" type="button" onClick={onClear}>Clear selection</button></div>
    <div className="library-ask-sources" aria-label={`${sources.length} selected saves`}>
      {sources.map((source) => <span className="library-ask-source" key={source.id}><span>{source.title || 'Untitled save'}</span><button type="button" aria-label={`Remove ${source.title || 'save'} from question`} onClick={() => onRemove(source)}>×</button></span>)}
    </div>
    <form className="library-ask-form" onSubmit={onSubmit}>
      <label className="visually-hidden" htmlFor="library-ask-question">Ask about your selected saves</label>
      <textarea id="library-ask-question" rows={2} maxLength={120} placeholder="What do these have in common?" value={answerQuestion} onChange={(event) => onQuestionChange(event.currentTarget.value)} />
      {aiPreference?.enabled && <><p className="library-ask-privacy">AI processing is enabled. Your question and selected excerpts will be sent to Meta AI.</p><button className="phase2-text-button" type="button" onClick={onDisableAi}>Disable AI answers</button></>}
      {aiPreference && !aiPreference.providerAvailable && <p className="library-ask-privacy">Grounded answers are temporarily unavailable. Your selected saves will not be sent.</p>}
      {answerError && <p className="notice error" role="alert">{answerError}</p>}
      <button className="primary-button" type="submit" disabled={answerBusy || !answerQuestion.trim() || !aiPreference?.providerAvailable}>{answerBusy ? 'Thinking…' : `Ask about ${sources.length} ${sources.length === 1 ? 'save' : 'saves'}`}</button>
    </form>
    {answerResult && <div className="library-ask-result" aria-live="polite">{answerResult.claims?.length ? <ol className="library-ask-claims">{answerResult.claims.map((claim, index) => <li key={`${index}-${claim.text}`}><p>{claim.text}</p><div>{claim.citationIds.map((id) => { const citation = answerResult.citations.find((source) => source.id === id); return citation ? <SavedItemLink key={id} itemId={id}>{citation.title}</SavedItemLink> : null; })}</div></li>)}</ol> : <><p>{answerResult.answer}</p>{answerResult.citations.length > 0 && <ol>{answerResult.citations.map((citation) => <li key={citation.id}><SavedItemLink itemId={citation.id}>{citation.title}</SavedItemLink>{citation.snippet && <p>{citation.snippet}</p>}</li>)}</ol>}</>}</div>}
  </section>;
}
