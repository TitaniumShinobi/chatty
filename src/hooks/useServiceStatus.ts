import { useState, useEffect, useCallback } from 'react';
import {
  ServiceStatus,
  checkFXShinobiStatus,
  checkVVAULTStatus,
  checkSupabaseStatus,
  checkAllServices,
} from '../lib/financeConfig';

export function useFXShinobiStatus(autoRefresh = false, refreshInterval = 30000) {
  const [status, setStatus] = useState<ServiceStatus>({
    name: 'FXShinobi',
    status: 'checking',
  });
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    const result = await checkFXShinobiStatus();
    setStatus(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { status, loading, refresh: check };
}

export function useVVAULTStatus(autoRefresh = false, refreshInterval = 30000) {
  const [status, setStatus] = useState<ServiceStatus>({
    name: 'VVAULT',
    status: 'checking',
  });
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    const result = await checkVVAULTStatus();
    setStatus(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { status, loading, refresh: check };
}

export function useSupabaseStatus(autoRefresh = false, refreshInterval = 30000) {
  const [status, setStatus] = useState<ServiceStatus>({
    name: 'Supabase',
    status: 'checking',
  });
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    const result = await checkSupabaseStatus();
    setStatus(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { status, loading, refresh: check };
}

export function useAllServicesStatus(autoRefresh = false, refreshInterval = 30000) {
  const [statuses, setStatuses] = useState<ServiceStatus[]>([
    { name: 'FXShinobi', status: 'checking' },
    { name: 'VVAULT', status: 'checking' },
    { name: 'Supabase', status: 'checking' },
  ]);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    const results = await checkAllServices();
    setStatuses(results);
    setLoading(false);
    return results;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { statuses, loading, refresh: check };
}

export function useLiveModeStatus() {
  const { status: fxStatus, loading, refresh } = useFXShinobiStatus(true, 30000);
  
  const isLive = fxStatus.liveMode === true;
  const isDegraded = fxStatus.status === 'degraded';
  const isOffline = fxStatus.status === 'offline' || fxStatus.status === 'not_configured';
  
  return {
    isLive,
    isDegraded,
    isOffline,
    status: fxStatus,
    loading,
    refresh,
    details: fxStatus.details,
  };
}
