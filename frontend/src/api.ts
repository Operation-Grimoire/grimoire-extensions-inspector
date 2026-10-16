// Typed client for the inspector backend (mirrors engine/Dto.kt + Report.kt).

export type Severity = "INFO" | "WARN" | "ERROR";

// Source ids are 64-bit and routinely exceed Number.MAX_SAFE_INTEGER, so the
// backend sends them as strings and they stay strings here (a JS number would
// round them and every per-source call would 404).
export type SourceId = string;

export interface SourceMeta {
  id: SourceId;
  name: string;
  lang: string;
  baseUrl: string;
  versionCode: number;
  className: string;
  capabilities: string[];
  hasDynamicFilters: boolean;
  supportsSearchWithFilters: boolean;
  hosts: string[];
  activeHost?: string | null;
  languages: string[];
}

export interface Novel {
  url: string;
  title: string;
  thumbnailUrl?: string | null;
  author?: string | null;
  description?: string | null;
  genres: string[];
  status: string;
  rating?: number | null;
  ratingCount?: number | null;
  language?: string | null;
  initialized: boolean;
}

export interface Chapter {
  url: string;
  name: string;
  uploadDate: number;
  chapterNumber: number;
  translator?: string | null;
  locked: boolean;
}

export interface Page {
  index: number;
  text: string;
  imageUrl?: string | null;
  isSeparator: boolean;
  formattedText?: string | null;
}

export interface FilterDto {
  name: string;
  type: string;
  values: string[];
  children: FilterDto[];
  state?: string | null;
}

export interface PrefDto {
  key: string;
  title: string;
  summary?: string | null;
  type: string;
  default: string;
  isPassword: boolean;
}

export interface LoginDto {
  loginUrl?: string | null;
  isLoggedIn?: boolean | null;
}

export interface UaDto {
  userAgent: string;
  overridden: boolean;
}

export interface Diagnostic {
  stage: string;
  severity: Severity;
  code: string;
  message: string;
  count?: number | null;
  samples: string[];
  exceptionType?: string | null;
}

export interface StageResult {
  stage: string;
  status: string;
  durationMs: number;
  counts: Record<string, number>;
  diagnostics: Diagnostic[];
  target?: string | null;
}

export interface Probe {
  title: string;
  url: string;
}

export interface SourceReport {
  source: SourceMeta;
  ok: boolean;
  stages: StageResult[];
  errors: number;
  warnings: number;
  probe?: Probe | null;
}

export interface RunReport {
  schemaVersion: number;
  startedAt: string;
  durationMs: number;
  query: string;
  sources: SourceReport[];
  totals: { sources: number; errors: number; warnings: number };
}

export interface EpubResult {
  sizeBytes: number;
  diagnostics: Diagnostic[];
}

export class ApiError extends Error {
  code: string;
  type?: string;
  constructor(error: string, code: string, type?: string) {
    super(error);
    this.code = code;
    this.type = type;
  }
}

async function parse<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const b = body as { error?: string; code?: string; type?: string };
    throw new ApiError(b.error ?? `HTTP ${r.status}`, b.code ?? "HTTP_ERROR", b.type);
  }
  return body as T;
}

export const api = {
  sources: () => fetch("/api/sources").then((r) => parse<SourceMeta[]>(r)),
  popular: (id: SourceId, page = 1) =>
    fetch(`/api/sources/${id}/popular?page=${page}`).then((r) => parse<Novel[]>(r)),
  latest: (id: SourceId, page = 1) =>
    fetch(`/api/sources/${id}/latest?page=${page}`).then((r) => parse<Novel[]>(r)),
  search: (id: SourceId, query: string, page = 1) =>
    post<Novel[]>(`/api/sources/${id}/search`, { query, page }),
  filters: (id: SourceId, fetchDynamic = false) =>
    fetch(`/api/sources/${id}/filters${fetchDynamic ? "?fetch=true" : ""}`).then((r) =>
      parse<FilterDto[]>(r),
    ),
  novel: (id: SourceId, url: string) => post<Novel>(`/api/sources/${id}/novel`, { url }),
  chapters: (id: SourceId, url: string, page?: number, concurrency?: number) =>
    post<Chapter[]>(`/api/sources/${id}/chapters`, { url, page, concurrency }),
  pages: (id: SourceId, url: string) => post<Page[]>(`/api/sources/${id}/pages`, { url }),
  epub: (id: SourceId, url: string) => post<EpubResult>(`/api/sources/${id}/epub`, { url }),
  epubDownloadUrl: (id: SourceId, url: string) =>
    `/api/sources/${id}/epub/download?url=${encodeURIComponent(url)}`,
  prefs: (id: SourceId) => fetch(`/api/sources/${id}/prefs`).then((r) => parse<PrefDto[]>(r)),
  setPrefs: (id: SourceId, values: Record<string, string>) =>
    post<{ ok: boolean }>(`/api/sources/${id}/prefs`, { values }),
  host: (id: SourceId) =>
    fetch(`/api/sources/${id}/host`).then((r) => parse<{ hosts: string[]; active: string }>(r)),
  setHost: (id: SourceId, host: string) =>
    post<{ hosts: string[]; active: string }>(`/api/sources/${id}/host`, { host }),
  languages: (id: SourceId) =>
    fetch(`/api/sources/${id}/languages`).then((r) =>
      parse<{ available: string[]; enabled: string[] }>(r),
    ),
  setLanguages: (id: SourceId, languages: string[]) =>
    post<{ available: string[]; enabled: string[] }>(`/api/sources/${id}/languages`, { languages }),
  login: (id: SourceId) => fetch(`/api/sources/${id}/login`).then((r) => parse<LoginDto>(r)),
  getCookies: (id: SourceId, url?: string) =>
    fetch(`/api/sources/${id}/cookies${url ? `?url=${encodeURIComponent(url)}` : ""}`).then((r) =>
      parse<{ url: string; cookies: string }>(r),
    ),
  cookies: (id: SourceId, cookies: string, url?: string) =>
    post<{ ok: boolean }>(`/api/sources/${id}/cookies`, { cookies, url }),
  clearCookies: (id: SourceId) =>
    fetch(`/api/sources/${id}/cookies`, { method: "DELETE" }).then((r) =>
      parse<{ ok: boolean }>(r),
    ),
  ua: () => fetch("/api/ua").then((r) => parse<UaDto>(r)),
  setUa: (userAgent: string) => post<UaDto>("/api/ua", { userAgent }),
  run: (source?: string, concurrency?: number) =>
    post<RunReport>("/api/run", { ...(source ? { source } : {}), concurrency }),
};

function post<T>(path: string, payload: unknown): Promise<T> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  }).then((r) => parse<T>(r));
}

export const imgUrl = (sourceId: SourceId, url: string) =>
  `/img?source=${sourceId}&url=${encodeURIComponent(url)}`;
