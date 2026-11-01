'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Radio, Trash2 } from 'lucide-react'
import {
  useArmbianArtifacts,
  useArmbianBuild,
  useArmbianBuildLogs,
  useArmbianBuilds,
  useDeleteArmbianBuild,
} from '@/domains/armbian/hooks'
import { useArmbianBuildSse } from '@/domains/armbian/sse'
import type { ArmbianBuildRecord, ArmbianBuildStatus } from '@/domains/armbian/types'
import {
  AuthDashboardAdminArmbian,
  DashboardAdminArmbianBuildId,
  DashboardAdminArmbianBuildIdEdit,
} from '@/routes'
import { useParams } from '@/routes/hooks'
import { Badge } from '@repo/ui/components/shadcn/badge'
import { Button } from '@repo/ui/components/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/shadcn/card'
import { Progress } from '@repo/ui/components/shadcn/progress'
import { ScrollArea } from '@repo/ui/components/shadcn/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/shadcn/tabs'

function statusVariant(status: ArmbianBuildStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'success') return 'secondary'
  if (status === 'failed') return 'destructive'
  if (status === 'running') return 'default'
  return 'outline'
}

export default function AdminArmbianBuildViewPage() {
  const router = useRouter()
  const params = useParams(DashboardAdminArmbianBuildId)
  const buildId = params.buildId

  const buildQuery = useArmbianBuild(buildId)
  const buildsQuery = useArmbianBuilds(200)
  const logsQuery = useArmbianBuildLogs(buildId, 1000)
  const artifactsQuery = useArmbianArtifacts(buildId)
  const deleteBuild = useDeleteArmbianBuild()

  const builds = (buildsQuery.data ?? []) as ArmbianBuildRecord[]
  const record = useMemo(
    () => builds.find((candidate) => candidate.buildId === buildId) ?? null,
    [buildId, builds],
  )

  const build = buildQuery.data ?? null
  const isLive = build?.status === 'running' || build?.status === 'queued'
  const live = useArmbianBuildSse(buildId, {
    enabled: isLive,
    intervalMs: 1500,
    tail: 1000,
  })

  const effectiveLogs = live.event?.logsTail ?? logsQuery.data?.logs ?? ''
  const effectiveStepIndex = live.event?.stepIndex ?? 0
  const effectiveTotalSteps = live.event?.totalSteps ?? 6
  const progressValue = Math.max(0, Math.min(100, Math.round((effectiveStepIndex / Math.max(1, effectiveTotalSteps)) * 100)))

  const handleDeleteBuild = async () => {
    const confirmed = globalThis.confirm(
      `Delete build ${buildId}? This removes metadata/artifacts and stops its worker container if still running.`,
    )
    if (!confirmed) {
      return
    }

    try {
      await deleteBuild.mutateAsync({ params: { buildId } })
      toast.success(`Build ${buildId.slice(0, 8)} deleted`)
      router.push(AuthDashboardAdminArmbian())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error'
      toast.error(`Failed to delete build: ${message}`)
    }
  }

  return (
    <div className='container mx-auto py-8 space-y-6'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-bold'>Build Details</h1>
          <p className='text-muted-foreground mt-2'>
            View complete runtime/build metadata, live stream logs, artifacts, and persisted request payload.
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <AuthDashboardAdminArmbian.Link>
            <Button variant='outline'>Back to list</Button>
          </AuthDashboardAdminArmbian.Link>
          <DashboardAdminArmbianBuildIdEdit.Link buildId={buildId}>
            <Button variant='outline' disabled={!record?.request}>Edit</Button>
          </DashboardAdminArmbianBuildIdEdit.Link>
          <Button
            variant='destructive'
            className='gap-2'
            onClick={() => {
              void handleDeleteBuild()
            }}
            disabled={deleteBuild.isPending}
          >
            <Trash2 className='h-4 w-4' />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center justify-between gap-2'>
            <span className='font-mono text-sm break-all'>{buildId}</span>
            <Badge variant={statusVariant(build?.status ?? 'not_found')}>{build?.status ?? 'not_found'}</Badge>
          </CardTitle>
          <CardDescription>
            container: <span className='font-mono text-xs'>{build?.containerName ?? '—'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          <p><span className='text-muted-foreground'>Started:</span> {build?.startedAt ? new Date(build.startedAt).toLocaleString() : '—'}</p>
          <p><span className='text-muted-foreground'>Finished:</span> {build?.finishedAt ? new Date(build.finishedAt).toLocaleString() : '—'}</p>
          <p><span className='text-muted-foreground'>Exit code:</span> {build?.exitCode ?? '—'}</p>
          <div className='space-y-1 pt-2'>
            <div className='flex items-center justify-between text-xs'>
              <span>step progress</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} />
            <p className='text-xs text-muted-foreground'>{live.event?.step ?? 'No live step data'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Build information</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue='logs' className='w-full'>
            <TabsList className='grid grid-cols-3 w-full'>
              <TabsTrigger value='logs'>Logs</TabsTrigger>
              <TabsTrigger value='artifacts'>Artifacts</TabsTrigger>
              <TabsTrigger value='config'>Request config</TabsTrigger>
            </TabsList>

            <TabsContent value='logs' className='space-y-2'>
              <div className='rounded border'>
                <div className='border-b px-3 py-2 text-xs font-semibold flex items-center gap-2'>
                  <Radio className='h-3.5 w-3.5' />
                  Live/runtime logs
                </div>
                <ScrollArea className='h-[480px]'>
                  <pre className='p-3 text-xs whitespace-pre-wrap wrap-break-word'>{effectiveLogs || 'No logs yet'}</pre>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value='artifacts' className='space-y-2'>
              {(artifactsQuery.data?.artifacts ?? []).length === 0 ? (
                <p className='text-sm text-muted-foreground'>No artifact available yet.</p>
              ) : (
                <div className='space-y-2'>
                  {(artifactsQuery.data?.artifacts ?? []).map((artifact) => (
                    <div key={artifact.filePath} className='rounded border p-3'>
                      <p className='font-medium break-all'>{artifact.fileName}</p>
                      <p className='text-xs text-muted-foreground break-all'>{artifact.filePath}</p>
                      <p className='text-xs text-muted-foreground'>{artifact.sizeBytes} bytes</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value='config'>
              {record?.request ? (
                <pre className='rounded border p-3 text-xs whitespace-pre-wrap wrap-break-word'>
                  {JSON.stringify(record.request, null, 2)}
                </pre>
              ) : (
                <p className='text-sm text-muted-foreground'>No persisted request payload found for this build.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
