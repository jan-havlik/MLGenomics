import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export interface FeatureInfo {
  name: string;
  group: string;
  description: string;
}

export interface ChromosomeInfo {
  name: string;
  parquet_available: boolean;
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
  model_type: string;
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
  chromosome: string;
  created_at: string;
  auc: number | null;
}

export interface TrainConfig {
  chromosome: string;
  model_type: string;
  features: string[] | null;
  model_params: Record<string, number> | null;
  neg_ratio: number;
  test_fraction: number;
}

export const fetchFeatures = (): Promise<FeatureInfo[]> =>
  api.get<FeatureInfo[]>("/features").then((r) => r.data);

export const fetchChromosomes = (): Promise<ChromosomeInfo[]> =>
  api.get<ChromosomeInfo[]>("/chromosomes").then((r) => r.data);

export const submitJob = (
  config: TrainConfig,
  bedFile: File | null
): Promise<{ job_id: string }> => {
  const form = new FormData();
  form.append("config", JSON.stringify(config));
  if (bedFile) form.append("bed_file", bedFile);
  return api.post<{ job_id: string }>("/jobs", form).then((r) => r.data);
};

export const fetchJob = (jobId: string): Promise<JobStatus> =>
  api.get<JobStatus>(`/jobs/${jobId}`).then((r) => r.data);

export const fetchJobs = (): Promise<JobListItem[]> =>
  api.get<JobListItem[]>("/jobs").then((r) => r.data);

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
