import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 / token expiry
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear auth state
      useAuthStore.getState().logout();
      // Redirect to login (client-side only)
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── API helpers ──────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    role: 'admin' | 'user';
  };
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      username,
      password,
    });
    return data;
  },
};

export interface ServiceHealth {
  name: string;
  url: string;
  status: 'up' | 'down' | 'unknown';
  lastChecked: Date;
  responseTime?: number;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'stopped' | 'paused' | 'restarting' | 'exited';
  ports: string[];
  created: string;
  cpu?: string;
  memory?: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: 'ollama' | 'openai' | 'claude' | 'huggingface';
  size?: string;
  modified?: string;
  available: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatRequest {
  model: string;
  message: string;
  history?: Array<{ role: string; content: string }>;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder' | 'bucket';
  size?: number;
  lastModified?: string;
  contentType?: string;
}

export interface StorageStats {
  used: number;
  total: number;
  buckets: number;
  objects: number;
}

export const vmApi = {
  listContainers: async (): Promise<Container[]> => {
    const { data } = await api.get<Container[]>('/vm/containers');
    return data;
  },
  startContainer: async (name: string): Promise<void> => {
    await api.post(`/vm/containers/${name}/start`);
  },
  stopContainer: async (name: string): Promise<void> => {
    await api.post(`/vm/containers/${name}/stop`);
  },
  restartContainer: async (name: string): Promise<void> => {
    await api.post(`/vm/containers/${name}/restart`);
  },
  getLogs: async (name: string, tail = 100): Promise<string> => {
    const { data } = await api.get<string>(`/vm/containers/${name}/logs`, {
      params: { tail },
    });
    return data;
  },
};

export const modelsApi = {
  list: async (): Promise<AIModel[]> => {
    const { data } = await api.get<AIModel[]>('/models');
    return data;
  },
  pull: async (modelName: string): Promise<void> => {
    await api.post('/models/pull', { name: modelName });
  },
  chat: async (request: ChatRequest): Promise<{ response: string }> => {
    const { data } = await api.post<{ response: string }>('/chat', request);
    return data;
  },
};

export const dataApi = {
  listFiles: async (path = ''): Promise<{ files: FileEntry[]; stats: StorageStats }> => {
    const { data } = await api.get('/data/files', { params: { path } });
    return data;
  },
  uploadFile: async (
    bucket: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', bucket);
    await api.post('/data/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
  },
  getStats: async (): Promise<StorageStats> => {
    const { data } = await api.get<StorageStats>('/data/stats');
    return data;
  },
};

export const sandboxApi = {
  run: async (params: {
    repoUrl: string;
    cpuLimit: string;
    memoryLimit: string;
    entrypoint?: string;
  }): Promise<{ jobId: string; message: string }> => {
    const { data } = await api.post('/sandbox/run', params);
    return data;
  },
};

export const settingsApi = {
  getSettings: async (): Promise<Record<string, string>> => {
    const { data } = await api.get('/settings');
    return data;
  },
  updateSettings: async (settings: Record<string, string>): Promise<void> => {
    await api.put('/settings', settings);
  },
};
