'use client'

import { useRouter } from 'next/navigation'
import { DashboardAdminArmbianBuildId } from '@/routes'
import { Button } from '@repo/ui/components/shadcn/button'
import { ArmbianBuildRequestEditor } from '../components/build-request-editor'

export default function AdminArmbianCreatePage() {
  const router = useRouter()

  return (
    <div className='container mx-auto py-8 space-y-6'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-bold'>Create Armbian Build</h1>
          <p className='text-muted-foreground mt-2'>
            Compose a build with dynamic form fields, plugin prompts, and dependency-aware plugin activation.
          </p>
        </div>

        <Button variant='outline' onClick={() => router.back()}>Back</Button>
      </div>

      <ArmbianBuildRequestEditor
        title='New build request'
        description='Submit a new build request. Running builds are processed in parallel by isolated workers.'
        submitLabel='Start build'
        onStarted={(buildId) => {
          router.push(DashboardAdminArmbianBuildId({ buildId }))
        }}
      />
    </div>
  )
}
