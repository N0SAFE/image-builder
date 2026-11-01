import { orpc } from '@/lib/orpc'

/**
 * Armbian domain endpoints
 *
 * Uses shared ORPC contracts exposed by the API app.
 */
export const armbianEndpoints = {
  getBuildFormConfig: orpc.armbian.getBuildFormConfig,
  createBuild: orpc.armbian.createBuild,
  listBuilds: orpc.armbian.listBuilds,
  getBuild: orpc.armbian.getBuild,
  deleteBuild: orpc.armbian.deleteBuild,
  getBuildLogs: orpc.armbian.getBuildLogs,
  listArtifacts: orpc.armbian.listArtifacts,
  streamBuild: orpc.armbian.streamBuild,
} as const

export type ArmbianEndpoints = typeof armbianEndpoints
