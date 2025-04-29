export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Camera {
  position: {
    x: number;
    y: number;
    z: number;
  };
  target: {
    x: number;
    y: number;
    z: number;
  };
  up: {
    x: number;
    y: number;
    z: number;
  };
  fov: number;
}

export interface RenderJob {
  jobId: string;
  designId: string;
  userId: string;
  camera: Camera;
  status: JobStatus;
  resultUrl?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface CreateJobRequest {
  designId: string;
  userId: string;
  camera: Camera;
}

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  resultUrl?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
} 