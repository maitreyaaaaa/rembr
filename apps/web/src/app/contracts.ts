export type Status = 'queued' | 'processing' | 'retry_wait' | 'cancel_requested' | 'cancelled' | 'paused' | 'partial' | 'ready' | 'failed';
export interface User { id: string; email: string }
export interface Profile { userId: string; username: string; avatarUrl: string | null; avatarAssetId?: string | null; avatarAssetUrl?: string | null }
export interface Tag { id: string; name: string }
export interface Asset { id: string; url: string; mime: string; byteSize: number }
export interface MediaAsset { id: string; url: string | null; mime: string | null; byteSize: number; status: 'ready' | 'failed'; errorCode: string | null }
export interface Note { body: string; links: string[]; assets: Asset[] }
export interface SavedItem {
  id: string; url: string; title: string; description: string; titleOverride?: string | null;
  descriptionOverride?: string | null; kind: 'page' | 'note'; status: Status; errorCode: string | null;
  createdAt: string; updatedAt: string; textPreview: string; text?: string; fetchedAt?: string;
  remembering?: { reason: string; nextDueAt: string; intervalDays: number; successfulRecalls: number } | null;
  tags: Tag[]; note?: Note; media?: MediaAsset[];
  cover?: { url: string; mime: string; byteSize: number } | null;
}
export interface Onboarding { contentTypes: string[]; referralSource: string; completedAt: string | null; skippedAt: string | null }
export interface AiPreference { enabled: boolean; consentVersion: string | null; consentedAt: string | null; disabledAt: string | null; updatedAt: string | null; providerAvailable: boolean }
export type AiSearchPreference = AiPreference;
export type VisualSearchPreference = AiPreference;
export interface SemanticSearchPreference extends AiPreference { indexedItems: number; eligibleItems: number }
export interface VisualSearchResult { query: string; visualDescription: string; results: SavedItem[]; searchEventId: string | null }
export interface WebSearchResultView { summary: string; citations: Array<{ title: string; url: string; snippet: string }> }
export interface AiMediaCoverage {
  expectedVideo?: boolean; pageImagesFound?: number; pageImagesUsed?: number; sourceVideoMime?: string | null;
  normalizedVideoMime?: string | null; videoDurationSeconds?: number | null; videoTruncated?: boolean;
  videoAnalyzed?: boolean; sampledFramesSeconds?: number[]; audioTrackDetected?: boolean;
  audioDurationSeconds?: number; transcriptAvailable?: boolean; warnings?: string[];
}
export interface AiAnalysisView { status: string; pauseReason: string | null; errorCode: string | null; updatedAt: string | null; result: null | { status: string; model: string; summary: string; visualDescription: string; ocrText: string; transcript: string; keywords: string[]; tags: string[]; brands: string[]; tools: string[]; people: string[]; repositories: string[]; imageCount: number; imageBytes: number; videoCount: number; videoBytes: number; mediaCoverage?: AiMediaCoverage; createdAt: string } }
export interface KnowledgeGraphItem { id: string; title: string; status: string; createdAt: string }
export interface KnowledgeGraphGroup { id: string; type: string; label: string; itemCount: number; items: KnowledgeGraphItem[] }
export interface KnowledgeGraphNode { id: string; type: string; label: string; itemId?: string; itemCount?: number }
export interface KnowledgeGraphLink { id: string; source: string; target: string; type: string }
export interface KnowledgeGraph { nodes: KnowledgeGraphNode[]; links: KnowledgeGraphLink[]; groups: KnowledgeGraphGroup[]; stats: { indexedItems: number; conceptNodes: number; links: number }; truncated: boolean }
export interface CheckupItem { id: string; title: string; status: string; created_at: string }
export interface CheckupReminder { id: string; itemId: string; remindAt: string; status: 'pending'; reason: string; note: string; item: CheckupItem }
export interface DuplicateImport { id: string; itemId: string; importedTitle: string; matchedItemTitle: string; sourcePlatform: string; importedAt: string }
export interface LinkHealthCheck { id: string; itemId: string; title: string; status: 'ok' | 'broken' | 'unknown'; sourceUrl: string; finalUrl: string | null; httpStatus: number | null; errorCode: string; errorMessage: string; checkedAt: string }
export interface LibraryCheckup { generatedAt: string; summary: { savedItems: number; unorganizedItems: number; needsAttention: number; olderSaves: number }; duplicateImports: { count: number; recent: DuplicateImport[] }; linkHealth: { checkedItems: number; brokenCount: number; unknownCount: number; lastCheckedAt: string | null; brokenLinks: LinkHealthCheck[] }; needsAttention: CheckupItem[]; olderSaves: CheckupItem[]; dueReminders: CheckupReminder[]; upcomingReminders: CheckupReminder[]; weeklyRediscovery: CheckupItem[]; dailyPick: CheckupItem | null; readOnly: true }
export interface LibraryAnswer { question: string; answer: string; claims?: Array<{ text: string; citationIds: string[] }>; citations: Array<{ id: string; title: string; snippet: string }>; resultIds: string[]; searchEventId: string | null; mode: 'lexical-excerpts' | 'grounded-ai' }
export interface LibraryChatTurn { role: 'user' | 'assistant'; content: string; response?: LibraryAnswer }
export interface SavedItemSummary { id: string; itemId: string; generation: number; model: string; promptVersion: string; sourceCharacters: number; summary: string; createdAt: string; stale?: boolean }
export const AI_DISCLOSURE_VERSION = '2026-10-29-v2';
export const AI_SEARCH_DISCLOSURE_VERSION = '2026-10-29-v5';
export const VISUAL_SEARCH_DISCLOSURE_VERSION = '2026-10-29-v1';
export const SEMANTIC_SEARCH_DISCLOSURE_VERSION = '2026-10-30-v1';
export interface Session { user: User; profile: Profile | null; profileComplete: boolean; accountStatus: 'active' | 'disabled' }
export interface ApiError extends Error { status: number; code: string }
