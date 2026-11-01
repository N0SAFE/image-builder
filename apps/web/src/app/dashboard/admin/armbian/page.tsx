'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import { Cpu, Plus, RefreshCw, Radio, Trash2 } from 'lucide-react'
import {
  useArmbianBuildLogs,
  useArmbianBuilds,
  useDeleteArmbianBuild,
} from '@/domains/armbian/hooks'
import { useArmbianBuildSse } from '@/domains/armbian/sse'
import type {
  ArmbianBuildRecord,
  ArmbianBuildStatus,
} from '@/domains/armbian/types'
import {
  DashboardAdminArmbianBuildId,
  DashboardAdminArmbianBuildIdEdit,
  DashboardAdminArmbianNew,
} from '@/routes'
import { Badge } from '@repo/ui/components/shadcn/badge'
import { Button } from '@repo/ui/components/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/shadcn/card'
import { Progress } from '@repo/ui/components/shadcn/progress'
import { ScrollArea } from '@repo/ui/components/shadcn/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/shadcn/table'

function statusVariant(status: ArmbianBuildStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'success') return 'secondary'
  if (status === 'failed') return 'destructive'
  if (status === 'running') return 'default'
  return 'outline'
}

function ActiveBuildCard({ buildId }: { buildId: string }) {
  const live = useArmbianBuildSse(buildId, {
    enabled: true,
    intervalMs: 1500,
    tail: 400,
  })
  const logsQuery = useArmbianBuildLogs(buildId, 400)

  const effectiveLogs = live.event?.logsTail ?? logsQuery.data?.logs ?? ''
  const stepIndex = live.event?.stepIndex ?? 0
  const totalSteps = live.event?.totalSteps ?? 6
  const progressValue = Math.max(0, Math.min(100, Math.round((stepIndex / Math.max(1, totalSteps)) * 100)))

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium flex items-center justify-between gap-2'>
          <span className='font-mono text-xs break-all'>{buildId}</span>
          <Badge variant={statusVariant(live.event?.status ?? 'running')}>{live.event?.status ?? 'running'}</Badge>
        </CardTitle>
        <CardDescription>{live.event?.step ?? 'Waiting for stream updates...'}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='space-y-1'>
          <div className='flex items-center justify-between text-xs'>
            <span>progress</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} />
        </div>

        <div className='rounded border'>
          <div className='border-b px-2 py-1 text-xs font-medium flex items-center gap-1'>
            <Radio className='h-3.5 w-3.5' />
            live logs
          </div>
          <ScrollArea className='h-40'>
            <pre className='p-2 text-[11px] whitespace-pre-wrap wrap-break-word'>{effectiveLogs || 'No logs yet'}</pre>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminArmbianListPage() {
  const buildsQuery = useArmbianBuilds(100)
  const deleteBuild = useDeleteArmbianBuild()

  const builds = (buildsQuery.data ?? []) as ArmbianBuildRecord[]
  const activeBuilds = useMemo(
    () => builds.filter((build) => build.details.status === 'running' || build.details.status === 'queued'),
    [builds],
  )

  const handleDeleteBuild = async (buildId: string) => {
    const confirmed = globalThis.confirm(
      `Delete build ${buildId}? This removes metadata/artifacts and stops its worker container if still running.`,
    )
    if (!confirmed) {
      return
    }

    try {
      const result = await deleteBuild.mutateAsync({ params: { buildId } })
      toast.success(result.deleted ? `Build ${buildId.slice(0, 8)} deleted` : 'Nothing to delete')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error'
      toast.error(`Failed to delete build: ${message}`)
    }
  }

  return (
    <div className='container mx-auto py-8 space-y-6'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-bold'>Armbian Builds</h1>
          <p className='text-muted-foreground mt-2'>
            CRUD panel for image builds: list, create, view, edit (as new run), and delete. Active runs stream in parallel below.
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            onClick={() => {
              void buildsQuery.refetch()
            }}
            disabled={buildsQuery.isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${buildsQuery.isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <DashboardAdminArmbianNew.Link>
            <Button className='gap-2'>
              <Plus className='h-4 w-4' />
              New build
            </Button>
          </DashboardAdminArmbianNew.Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Cpu className='h-4 w-4' />
            Parallel live monitoring
          </CardTitle>
          <CardDescription>
            Running and queued builds are monitored in parallel with independent stream/log panels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeBuilds.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No running build at the moment.</p>
          ) : (
            <div className='grid grid-cols-1 xl:grid-cols-2 gap-3'>
              {activeBuilds.map((build) => (
                <ActiveBuildCard key={build.buildId} buildId={build.buildId} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Build registry</CardTitle>
          <CardDescription>All recent build records with CRUD actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Build</TableHead>
                <TableHead>Board</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {builds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='py-8 text-center text-muted-foreground'>
                    No Armbian build yet.
                  </TableCell>
                </TableRow>
              ) : (
                builds.map((record) => (
                  <TableRow key={record.buildId}>
                    <TableCell className='font-mono text-xs break-all max-w-[220px]'>{record.buildId}</TableCell>
                    <TableCell>{record.request?.board ?? '—'}</TableCell>
                    <TableCell>{record.request?.release ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(record.details.status)}>{record.details.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {record.details.startedAt ? new Date(record.details.startedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-2'>
                        <DashboardAdminArmbianBuildId.Link buildId={record.buildId}>
                          <Button size='sm' variant='outline'>View</Button>
                        </DashboardAdminArmbianBuildId.Link>

                        <DashboardAdminArmbianBuildIdEdit.Link buildId={record.buildId}>
                          <Button size='sm' variant='outline' disabled={!record.request}>Edit</Button>
                        </DashboardAdminArmbianBuildIdEdit.Link>

                        <Button
                          size='sm'
                          variant='destructive'
                          className='gap-1'
                          disabled={deleteBuild.isPending}
                          onClick={() => {
                            void handleDeleteBuild(record.buildId)
                          }}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
