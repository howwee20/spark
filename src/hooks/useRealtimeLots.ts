import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostgrestError, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

const LOTS_QUERY = 'id,name,lat,lng,lot_current(status,confidence)';
const POLL_INTERVAL_MS = 20_000;

type LotCurrentRow = {
  lot_id: number;
  status: string | null;
  confidence: number | null;
};

export type LotStatus = 'empty' | 'filling' | 'tight' | 'full' | string;

export type RealtimeLot = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: LotStatus | null;
  confidence: number | null;
};

type RawLotRow = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  lot_current?:
    | null
    | LotCurrentRow
    | LotCurrentRow[];
};

const normalizeLotCurrent = (value: RawLotRow['lot_current']): LotCurrentRow | null => {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
};

export type UseRealtimeLotsResult = {
  lots: RealtimeLot[];
  isLoading: boolean;
  error: PostgrestError | null;
  isRealtimeConnected: boolean;
  isPollingFallbackActive: boolean;
  refresh: (showLoading?: boolean) => Promise<void>;
};

export const useRealtimeLots = (): UseRealtimeLotsResult => {
  const [lots, setLots] = useState<RealtimeLot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<PostgrestError | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [isPollingFallbackActive, setIsPollingFallbackActive] = useState<boolean>(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mapLots = useCallback((rows: RawLotRow[]): RealtimeLot[] => {
    return rows.map((row) => {
      const current = normalizeLotCurrent(row.lot_current);

      return {
        id: row.id,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        status: current?.status ?? null,
        confidence: current?.confidence ?? null,
      };
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPollingFallbackActive(false);
  }, []);

  const fetchLots = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setIsLoading(true);
      }

      const { data, error: fetchError } = await supabase
        .from('lots')
        .select(LOTS_QUERY)
        .order('name', { ascending: true });

      if (!isMountedRef.current) {
        return;
      }

      if (fetchError) {
        setError(fetchError);
      } else {
        setError(null);
        setLots(mapLots(data ?? []));
      }

      setIsLoading(false);
    },
    [mapLots],
  );

  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      return;
    }

    pollingRef.current = setInterval(() => {
      void fetchLots();
    }, POLL_INTERVAL_MS);

    setIsPollingFallbackActive(true);
    void fetchLots();
  }, [fetchLots]);

  const handleRealtimePayload = useCallback(
    (payload: RealtimePostgresChangesPayload<LotCurrentRow>) => {
      const lotId = payload.new?.lot_id ?? payload.old?.lot_id;

      if (!lotId) {
        return;
      }

      const status = payload.eventType === 'DELETE' ? null : payload.new?.status ?? null;
      const confidence = payload.eventType === 'DELETE' ? null : payload.new?.confidence ?? null;

      let shouldRefetch = false;

      setLots((previousLots) => {
        const index = previousLots.findIndex((lot) => lot.id === lotId);

        if (index === -1) {
          shouldRefetch = true;
          return previousLots;
        }

        const nextLots = [...previousLots];
        nextLots[index] = {
          ...nextLots[index],
          status,
          confidence,
        };

        return nextLots;
      });

      if (shouldRefetch) {
        void fetchLots();
      }
    },
    [fetchLots],
  );

  useEffect(() => {
    void fetchLots(true);
  }, [fetchLots]);

  useEffect(() => {
    const channel = supabase
      .channel('public:lot_current')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lot_current',
        },
        handleRealtimePayload,
      )
      .subscribe((status) => {
        const isConnected = status === 'SUBSCRIBED';
        setIsRealtimeConnected(isConnected);

        if (isConnected) {
          stopPolling();
          void fetchLots();
        } else {
          startPolling();
        }
      });

    return () => {
      stopPolling();
      void channel.unsubscribe();
    };
  }, [handleRealtimePayload, startPolling, stopPolling, fetchLots]);

  return useMemo(
    () => ({
      lots,
      isLoading,
      error,
      isRealtimeConnected,
      isPollingFallbackActive,
      refresh: fetchLots,
    }),
    [lots, isLoading, error, isRealtimeConnected, isPollingFallbackActive, fetchLots],
  );
};
