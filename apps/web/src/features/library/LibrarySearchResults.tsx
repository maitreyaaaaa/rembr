import type { LibraryAnswer, SavedItem, WebSearchResultView } from '../../app/contracts.js';
import { SavedItemLink } from '../../components/SavedItemLink.js';

export function LibrarySearchResults({
  composerAnswer,
  composerAnswerBusy,
  webSearchError,
  libraryAnswerError,
  semanticSearchError,
  onRetry,
  webSearchBusy,
  semanticResults,
  webSearchResult,
  search,
  libraryAnswer,
}: {
  composerAnswer: LibraryAnswer | null;
  composerAnswerBusy: boolean;
  webSearchError: string;
  libraryAnswerError: string;
  semanticSearchError: string;
  onRetry: () => void;
  webSearchBusy: boolean;
  semanticResults: SavedItem[];
  webSearchResult: WebSearchResultView | null;
  search: string;
  libraryAnswer: LibraryAnswer | null;
}) {
  return <>
    {composerAnswerBusy && <p className="phase2-state" role="status">Answering from your selected saves…</p>}
    {composerAnswer && <section className="phase2-panel web-search-results" aria-labelledby="composer-answer-title"><h2 id="composer-answer-title">Answer from your selected saves</h2>{composerAnswer.claims?.length ? <ol className="library-ask-claims">{composerAnswer.claims.map((claim, index) => <li key={`${index}-${claim.text}`}><p>{claim.text}</p><div>{claim.citationIds.map((id) => { const citation = composerAnswer.citations.find((source) => source.id === id); return citation ? <SavedItemLink key={id} itemId={id}>{citation.title}</SavedItemLink> : null; })}</div></li>)}</ol> : <p>{composerAnswer.answer}</p>}</section>}
    {(webSearchError || libraryAnswerError || semanticSearchError) && <div className="notice error" role="alert"><span>{[webSearchError, libraryAnswerError, semanticSearchError].filter(Boolean).join(' ')}</span><button className="quiet-button" type="button" onClick={onRetry}>Try again</button></div>}
    {webSearchBusy && <p className="phase2-state" role="status">Searching the web and your saved library…</p>}
    {semanticResults.length > 0 && <section className="phase2-panel semantic-search-results" aria-labelledby="semantic-search-results-title"><h2 id="semantic-search-results-title">Meaning matches from your library</h2><ul>{semanticResults.map((item) => <li key={item.id}><SavedItemLink itemId={item.id}>{item.title || 'Untitled save'}</SavedItemLink><span>{item.kind === 'note' ? 'Note' : 'Saved page'}</span></li>)}</ul></section>}
    {webSearchResult && <section className="phase2-panel web-search-results" aria-labelledby="web-search-result-title"><h2 id="web-search-result-title">Web results for “{search}”</h2><p>{webSearchResult.summary}</p><h3>Web sources</h3><ul>{webSearchResult.citations.map((citation) => <li key={citation.url}><a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>{citation.snippet && <p>{citation.snippet}</p>}</li>)}</ul></section>}
    {libraryAnswer && <section className="phase2-panel web-search-results" aria-labelledby="library-answer-title"><h2 id="library-answer-title">From your saved library</h2><p>{libraryAnswer.answer}</p>{libraryAnswer.citations.length > 0 && <><h3>Saved sources</h3><ul>{libraryAnswer.citations.map((citation) => <li key={citation.id}><SavedItemLink itemId={citation.id}>{citation.title}</SavedItemLink>{citation.snippet && <p>{citation.snippet}</p>}</li>)}</ul></>}</section>}
  </>;
}
