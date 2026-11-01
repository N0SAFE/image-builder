'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardAdminArmbianBuildId, DashboardAdminArmbianBuildIdEdit } from '@/routes'
import { useParams } from '@/routes/hooks'
import { useArmbianBuilds } from '@/domains/armbian/hooks'
import type { ArmbianBuildRecord } from '@/domains/armbian/types'
import { Button } from '@repo/ui/components/shadcn/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/shadcn/card'
import { ArmbianBuildRequestEditor } from '../../components/build-request-editor'

export default function AdminArmbianEditPage() {
  const router = useRouter()
  const params = useParams(DashboardAdminArmbianBuildIdEdit)
  const buildId = params.buildId

  const buildsQuery = useArmbianBuilds(200)
  const builds = (buildsQuery.data ?? []) as ArmbianBuildRecord[]

  const record = useMemo(
    () => builds.find((candidate) => candidate.buildId === buildId) ?? null,
    [buildId, builds],
  )

  return (
    <div className='container mx-auto py-8 space-y-6'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-bold'>Edit Build Configuration</h1>
          <p className='text-muted-foreground mt-2'>
            Update the saved request and start a new build run from this edited configuration.
          </p>
        </div>

        <Button variant='outline' onClick={() => router.push(DashboardAdminArmbianBuildId({ buildId }))}>Back to build</Button>
      </div>

      {record?.request ? (
        <ArmbianBuildRequestEditor
          initialRequest={record.request}
          title='Edit request & run'
          description={`Source build: ${buildId}`}
          submitLabel='Start edited build'
          onStarted={(nextBuildId) => {
            router.push(DashboardAdminArmbianBuildId({ buildId: nextBuildId }))
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No editable request found</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              This build has no persisted request payload, so it cannot be edited.
            </p>
            <Button onClick={() => router.push(DashboardAdminArmbianBuildId({ buildId }))}>Open build details</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
