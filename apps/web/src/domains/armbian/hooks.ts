"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { armbianEndpoints } from './endpoints'

const NIL_BUILD_ID = '00000000-0000-0000-0000-000000000000'

function withBuildIdParams(buildId: string | null) {
  const resolvedBuildId = buildId ?? NIL_BUILD_ID

  return {
    buildId: resolvedBuildId,
    params: { buildId: resolvedBuildId },
  }
}

export function useArmbianBuildFormConfig() {
  return useQuery({
    ...armbianEndpoints.getBuildFormConfig.queryOptions({ input: {} }),
    staleTime: 1000 * 60 * 10,
  })
}

export function useArmbianBuilds(limit = 25) {
  const options = armbianEndpoints.listBuilds.queryOptions({ input: { query: { limit } } })

  return useQuery({
    ...options,
    refetchInterval: 5000,
  })
}

export function useArmbianBuild(buildId: string | null) {
  const options = armbianEndpoints.getBuild.queryOptions({
    input: withBuildIdParams(buildId),
  })

  return useQuery({
    ...options,
    enabled: Boolean(buildId),
    refetchInterval: 2000,
  })
}

export function useArmbianBuildLogs(buildId: string | null, tail = 400) {
  const options = armbianEndpoints.getBuildLogs.queryOptions({
    input: {
      ...withBuildIdParams(buildId),
      query: { tail },
    },
  })

  return useQuery({
    ...options,
    enabled: Boolean(buildId),
    refetchInterval: 3000,
  })
}

export function useArmbianArtifacts(buildId: string | null) {
  const options = armbianEndpoints.listArtifacts.queryOptions({
    input: withBuildIdParams(buildId),
  })

  return useQuery({
    ...options,
    enabled: Boolean(buildId),
    refetchInterval: 5000,
  })
}

export function useStartArmbianBuild() {
  const queryClient = useQueryClient()

  return useMutation(
    armbianEndpoints.createBuild.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['armbian'] })
      },
    }),
  )
}

export function useDeleteArmbianBuild() {
  const queryClient = useQueryClient()

  return useMutation(
    armbianEndpoints.deleteBuild.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['armbian'] })
      },
    }),
  )
}
