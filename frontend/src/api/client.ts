import axios, { type AxiosRequestConfig } from "axios";

const api = axios.create({ baseURL: "/api" });

// ---------------------------------------------------------------------------
// Loading observer — count of in-flight requests, broadcast to subscribers.
// Requests flagged `silent` (polling/background) don't drive the progress bar.
// ---------------------------------------------------------------------------
type MaybeSilent = { silent?: boolean };

let inFlight = 0;
const listeners = new Set<(count: number) => void>();
const notify = () => listeners.forEach((fn) => fn(inFlight));

export const onLoadingChange = (fn: (count: number) => void): (() => void) => {
  listeners.add(fn);
  fn(inFlight);
  return () => {
    listeners.delete(fn);
  };
};

api.interceptors.request.use((config) => {
  if (!(config as MaybeSilent).silent) {
    inFlight++;
    notify();
  }
  return config;
});

const finish = (config: MaybeSilent | undefined) => {
  if (!config?.silent) {
    inFlight = Math.max(0, inFlight - 1);
    notify();
  }
};

api.interceptors.response.use(
  (resp) => {
    finish(resp.config as unknown as MaybeSilent);
    return resp;
  },
  (err) => {
    finish(err?.config as MaybeSilent | undefined);
    return Promise.reject(err);
  },
);

// Helper for polling/background fetches that should NOT show loading bar.
const silent: AxiosRequestConfig = { silent: true } as AxiosRequestConfig & MaybeSilent;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FeatureInfo {
  name: string;
  group: string;
  description: string;
}

export interface ChromosomeInfo {
  name: string;
  cached: boolean;
  n_windows: number | null;
}

export interface GenomeInfo {
  id: string;
  display_name: string;
  species: string;
  chromosomes: string[];
}

export interface CacheStatus {
  genome: string;
  chromosome: string;
  cached: boolean;
  status: "running" | "completed" | "failed" | null;
  progress: number | null;
  stage: string | null;
  error: string | null;
  n_windows: number | null;
}

export interface JobMetrics {
  auc: number | null;
  ap: number | null;
  cv_auc_mean: number;
  cv_auc_std: number;
  n_positives: number;
  n_negatives: number;
  n_highconf_regions: number;
}

export interface JobStatus {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  stage: string | null;
  model_type: string;
  genome: string;
  chromosome: string;
  created_at: string;
  metrics: JobMetrics | null;
  feature_importance: Record<string, number> | null;
  error: string | null;
}

export interface JobListItem {
  job_id: string;
  status: string;
  model_type: string;
  genome: string;
  chromosome: string;
  created_at: string;
  auc: number | null;
}

export interface TrainConfig {
  genome: string;
  chromosome: string;
  model_type: string;
  features: string[] | null;
  model_params: Record<string, number> | null;
  neg_ratio: number;
  test_fraction: number;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------
export const fetchFeatures = (): Promise<FeatureInfo[]> =>
  api.get<FeatureInfo[]>("/features").then((r) => r.data);

export const fetchChromosomes = (genome: string): Promise<ChromosomeInfo[]> =>
  api.get<ChromosomeInfo[]>("/chromosomes", { params: { genome } }).then((r) => r.data);

export const fetchGenomes = (): Promise<GenomeInfo[]> =>
  api.get<GenomeInfo[]>("/genomes").then((r) => r.data);

export const fetchCacheStatus = (
  genome: string,
  chromosome: string,
  opts?: { silent?: boolean }
): Promise<CacheStatus> =>
  api
    .get<CacheStatus>(
      `/genome/${genome}/chromosome/${chromosome}/status`,
      opts?.silent ? silent : undefined
    )
    .then((r) => r.data);

export const prepareCache = (
  genome: string,
  chromosome: string
): Promise<{ task_id: string; genome: string; chromosome: string }> =>
  api
    .post<{ task_id: string; genome: string; chromosome: string }>(
      `/genome/${genome}/chromosome/${chromosome}/prepare`
    )
    .then((r) => r.data);

export interface CacheUsage {
  used_bytes: number;
  max_bytes: number;
  fraction: number;
}

export const fetchCacheUsage = (opts?: { silent?: boolean }): Promise<CacheUsage> =>
  api
    .get<CacheUsage>("/cache/usage", opts?.silent ? silent : undefined)
    .then((r) => r.data);

export const submitJob = (
  config: TrainConfig,
  bedFile: File | null
): Promise<{ job_id: string }> => {
  const form = new FormData();
  form.append("config", JSON.stringify(config));
  if (bedFile) form.append("bed_file", bedFile);
  return api.post<{ job_id: string }>("/jobs", form).then((r) => r.data);
};

export const fetchJob = (jobId: string, opts?: { silent?: boolean }): Promise<JobStatus> =>
  api.get<JobStatus>(`/jobs/${jobId}`, opts?.silent ? silent : undefined).then((r) => r.data);

export const fetchJobs = (opts?: { silent?: boolean }): Promise<JobListItem[]> =>
  api.get<JobListItem[]>("/jobs", opts?.silent ? silent : undefined).then((r) => r.data);

export const deleteJob = (jobId: string): Promise<void> =>
  api.delete(`/jobs/${jobId}`).then(() => undefined);

export const exportUrl = (jobId: string) => `/api/jobs/${jobId}/export`;

// ---------------------------------------------------------------------------
// Model library
// ---------------------------------------------------------------------------

export interface LibraryModelInfo {
  name: string;
  display_name: string;
  description: string;
  model_type: string;
  chromosome: string;
  auc: number | null;
  ap: number | null;
  n_features: number;
  feature_cols: string[];
  tags: string[];
  created_at: string;
}

export interface SaveToLibraryRequest {
  name: string;
  display_name: string;
  description?: string;
  tags?: string[];
}

export interface PatchLibraryRequest {
  display_name?: string;
  description?: string;
  tags?: string[];
}

export const saveToLibrary = (
  jobId: string,
  req: SaveToLibraryRequest
): Promise<LibraryModelInfo> =>
  api.post<LibraryModelInfo>(`/jobs/${jobId}/save`, req).then((r) => r.data);

export const fetchLibrary = (): Promise<LibraryModelInfo[]> =>
  api.get<LibraryModelInfo[]>("/library").then((r) => r.data);

export const getLibraryModel = (name: string): Promise<LibraryModelInfo> =>
  api.get<LibraryModelInfo>(`/library/${name}`).then((r) => r.data);

export const patchLibraryModel = (
  name: string,
  req: PatchLibraryRequest
): Promise<LibraryModelInfo> =>
  api.patch<LibraryModelInfo>(`/library/${name}`, req).then((r) => r.data);

export const deleteLibraryModel = (name: string): Promise<void> =>
  api.delete(`/library/${name}`).then(() => undefined);

export const exportLibraryUrl = (name: string) => `/api/library/${name}/export`;

export const importLibraryModel = (zipFile: File): Promise<LibraryModelInfo> => {
  const form = new FormData();
  form.append("file", zipFile);
  return api.post<LibraryModelInfo>("/library/import", form).then((r) => r.data);
};

export const runLibraryPredict = (name: string): Promise<{ job_id: string }> =>
  api.post<{ job_id: string }>(`/library/${name}/predict`).then((r) => r.data);
