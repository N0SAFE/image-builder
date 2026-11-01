"use client";

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { armbianEndpoints } from './endpoints'
import type { ArmbianBuildStreamEvent } from './types'

const NIL_BUILD_ID = '00000000-0000-0000-0000-000000000000'

interface UseArmbianBuildSseOptions {
  intervalMs?: number
  tail?: number
  enabled?: boolean
}

export function useArmbianBuildSse(buildId: string | null, options?: UseArmbianBuildSseOptions) {
  const intervalMs = options?.intervalMs ?? 2000
  const tail = options?.tail ?? 400
  const enabled = options?.enabled ?? true

  const streamInput = useMemo(() => {
    if (!buildId || !enabled) {
      return null
    }

    return {
      buildId,
      params: { buildId },
      query: { intervalMs, tail },
    }
  }, [buildId, enabled, intervalMs, tail])

  const liveQuery = useQuery({
    ...armbianEndpoints.streamBuild.experimental_liveOptions({
      input: streamInput ?? {
        buildId: NIL_BUILD_ID,
        params: { buildId: NIL_BUILD_ID },
        query: { intervalMs, tail },
      },
    }),
    enabled: Boolean(streamInput),
    retry: true,
  })

  const event = liveQuery.data ?? null

  return {
    status: liveQuery.status,
    error: liveQuery.error,
    fetchStatus: liveQuery.fetchStatus,
    event,
  }
}
