// Typed client for the inspector backend (mirrors engine/Dto.kt + Report.kt).

export type Severity = "INFO" | "WARN" | "ERROR";

export interface SourceMeta {
  id: number;
  name: string;
  lang: string;
  baseUrl: string;
  versionCode: number;
  className: string;
  capabilities: string[];
  hasDynamicFilters: boolean;
  supportsSearchWithFilters: boolean;
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
}

export interface SourceReport {
  source: SourceMeta;
  ok: boolean;
  stages: StageResult[];
  errors: number;
  warnings: number;
}

export interface RunReport {
  schemaVersion: number;
  startedAt: string;
  durationMs: number;
  query: string;
  sources: SourceReport[];
  totals: { sources: number; errors: number; warnings: number };
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
  popular: (id: number, page = 1) =>
    fetch(`/api/sources/${id}/popular?page=${page}`).then((r) => parse<Novel[]>(r)),
  latest: (id: number, page = 1) =>
    fetch(`/api/sources/${id}/latest?page=${page}`).then((r) => parse<Novel[]>(r)),
  search: (id: number, query: string, page = 1) =>
    post<Novel[]>(`/api/sources/${id}/search`, { query, page }),
  filters: (id: number, fetchDynamic = false) =>
    fetch(`/api/sources/${id}/filters${fetchDynamic ? "?fetch=true" : ""}`).then((r) =>
      parse<FilterDto[]>(r),
    ),
  novel: (id: number, url: string) => post<Novel>(`/api/sources/${id}/novel`, { url }),
  chapters: (id: number, url: string, page?: number) =>
    post<Chapter[]>(`/api/sources/${id}/chapters`, { url, page }),
  pages: (id: number, url: string) => post<Page[]>(`/api/sources/${id}/pages`, { url }),
  prefs: (id: number) => fetch(`/api/sources/${id}/prefs`).then((r) => parse<PrefDto[]>(r)),
  setPrefs: (id: number, values: Record<string, string>) =>
    post<{ ok: boolean }>(`/api/sources/${id}/prefs`, { values }),
  login: (id: number) => fetch(`/api/sources/${id}/login`).then((r) => parse<LoginDto>(r)),
  cookies: (id: number, cookies: string, url?: string) =>
    post<{ ok: boolean }>(`/api/sources/${id}/cookies`, { cookies, url }),
  run: (source?: string) => post<RunReport>("/api/run", source ? { source } : {}),
};

function post<T>(path: string, payload: unknown): Promise<T> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  }).then((r) => parse<T>(r));
}

export const imgUrl = (sourceId: number, url: string) =>
  `/img?source=${sourceId}&url=${encodeURIComponent(url)}`;
