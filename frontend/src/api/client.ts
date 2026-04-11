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
