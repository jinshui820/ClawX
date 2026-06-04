/**
 * Device Enrollment Store
 * Renderer-side state for device enrollment + remote LiteLLM key retrieval.
 * Backed by the main-process enrollment service via IPC (enrollment:*).
 */
import { create } from 'zustand';
import { invokeIpc } from '@/lib/api-client';

export interface EnrollmentStatus {
  configured: boolean;
  enrolled: boolean;
  hasKey: boolean;
  deviceId?: string;
  configFetchedAt?: number;
}

interface EnrollResult {
  success: boolean;
  error?: string;
  status: EnrollmentStatus;
}

interface EnrollmentState {
  status: EnrollmentStatus | null;
  machineHash: string | null;
  busy: boolean;
  error: string | null;
  initialized: boolean;
  init: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  enroll: (code: string, deviceName?: string) => Promise<boolean>;
  refreshConfig: () => Promise<boolean>;
  reset: () => Promise<void>;
}

export const useEnrollmentStore = create<EnrollmentState>((set, get) => ({
  status: null,
  machineHash: null,
  busy: false,
  error: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    await get().refreshStatus();
    try {
      set({ machineHash: await invokeIpc<string>('enrollment:machineHash') });
    } catch {
      // machine hash is best-effort (for display only)
    }
  },

  refreshStatus: async () => {
    try {
      const status = await invokeIpc<EnrollmentStatus>('enrollment:status');
      set({ status });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  enroll: async (code, deviceName) => {
    set({ busy: true, error: null });
    try {
      const r = await invokeIpc<EnrollResult>('enrollment:enroll', { code, deviceName });
      set({ status: r.status, error: r.success ? null : (r.error ?? 'enroll failed'), busy: false });
      return r.success;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), busy: false });
      return false;
    }
  },

  refreshConfig: async () => {
    set({ busy: true, error: null });
    try {
      const r = await invokeIpc<EnrollResult>('enrollment:refresh');
      set({ status: r.status, error: r.success ? null : (r.error ?? 'refresh failed'), busy: false });
      return r.success;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), busy: false });
      return false;
    }
  },

  reset: async () => {
    set({ busy: true, error: null });
    try {
      const r = await invokeIpc<{ success: boolean; status: EnrollmentStatus }>('enrollment:reset');
      set({ status: r.status, busy: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), busy: false });
    }
  },
}));
