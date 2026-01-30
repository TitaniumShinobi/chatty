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

  const check = useCallback(async () => {
    const result = await checkFXShinobiStatus();
    setStatus(result);
    return result;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { status, refresh: check };
}

export function useVVAULTStatus(autoRefresh = false, refreshInterval = 30000) {
  const [status, setStatus] = useState<ServiceStatus>({
    name: 'VVAULT',
    status: 'checking',
  });

  const check = useCallback(async () => {
    const result = await checkVVAULTStatus();
    setStatus(result);
    return result;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { status, refresh: check };
}

export function useSupabaseStatus(autoRefresh = false, refreshInterval = 30000) {
  const [status, setStatus] = useState<ServiceStatus>({
    name: 'Supabase',
    status: 'checking',
  });

  const check = useCallback(async () => {
    const result = await checkSupabaseStatus();
    setStatus(result);
    return result;
  }, []);

  useEffect(() => {
    check();
    if (autoRefresh) {
      const interval = setInterval(check, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [check, autoRefresh, refreshInterval]);

  return { status, refresh: check };
}

export function useAllServicesStatus(autoRefresh = false, refreshInterval = 30000) {
  const [statuses, setStatuses] = useState<ServiceStatus[]>([
    { name: 'FXShinobi', status: 'checking' },
    { name: 'VVAULT', status: 'checking' },
    { name: 'Supabase', status: 'checking' },
  ]);
  const [loading, setLoading] = useState(true);

  const checkAll = useCallback(async () => {
    setLoading(true);
    const results = await checkAllServices();
    setStatuses(results);
    setLoading(false);
    return results;
  }, []);

  useEffect(() => {
    checkAll();
    if (autoRefresh) {
      const interval = setInterval(checkAll, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [checkAll, autoRefresh, refreshInterval]);

  return { statuses, loading, refresh: checkAll };
}
