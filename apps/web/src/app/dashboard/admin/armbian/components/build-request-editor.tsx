'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Rocket } from 'lucide-react'
import { useArmbianBuildFormConfig, useStartArmbianBuild } from '@/domains/armbian/hooks'
import type {
  ArmbianBuildFormConfig,
  ArmbianBuildPluginSelection,
  ArmbianBuildRequest,
  ArmbianConfigValue,
  ArmbianFormField,
  ArmbianPluginDefinition,
} from '@/domains/armbian/types'
import { Button } from '@repo/ui/components/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/shadcn/card'
import { Input } from '@repo/ui/components/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/shadcn/select'
import { Switch } from '@repo/ui/components/shadcn/switch'

type DynamicValues = Record<string, ArmbianConfigValue>

const RELEASES: ArmbianBuildRequest['release'][] = ['bookworm', 'bullseye', 'jammy', 'noble']

function isFieldVisible(field: ArmbianFormField, values: DynamicValues) {
  if (!field.visibleWhen) {
    return true
  }

  return values[field.visibleWhen.fieldKey] === field.visibleWhen.equals
}

function isMissingRequiredValue(field: ArmbianFormField, values: DynamicValues) {
  if (!field.required || !isFieldVisible(field, values)) {
    return false
  }

  const value = values[field.key]
  if (value === undefined) {
    return true
  }

  if (typeof value === 'string') {
    return value.trim().length === 0
  }

  return false
}

function getDefaultValues(fields: ArmbianFormField[]) {
  const values: DynamicValues = {}

  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue
    }
  }

  return values
}

function normalizeOptionalString(value: ArmbianConfigValue | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function buildRequestPayload(
  formConfig: ArmbianBuildFormConfig,
  coreValues: DynamicValues,
  enabledPlugins: Record<string, boolean>,
  pluginValues: Record<string, DynamicValues>,
): ArmbianBuildRequest {
  const selectedBoard = normalizeOptionalString(coreValues.board) ?? 'orangepi5'
  const board = selectedBoard === 'custom'
    ? normalizeOptionalString(coreValues.customBoard) ?? ''
    : selectedBoard

  const rawRelease = normalizeOptionalString(coreValues.release)
  const release = RELEASES.includes((rawRelease ?? 'noble') as ArmbianBuildRequest['release'])
    ? (rawRelease as ArmbianBuildRequest['release'])
    : 'noble'

  const rawTimezone = normalizeOptionalString(coreValues.timezone)
  const timezone = rawTimezone === 'custom'
    ? normalizeOptionalString(coreValues.customTimezone)
    : rawTimezone

  const plugins: ArmbianBuildPluginSelection[] = formConfig.plugins
    .filter((plugin) => enabledPlugins[plugin.id])
    .map((plugin) => {
      const values = pluginValues[plugin.id] ?? {}
      const config: Record<string, ArmbianConfigValue> = {}

      for (const field of plugin.fields) {
        if (!isFieldVisible(field, values)) {
          continue
        }

        const value = values[field.key] ?? field.defaultValue
        if (value === undefined) {
          continue
        }

        if (typeof value === 'string' && value.trim().length === 0) {
          continue
        }

        config[field.key] = value
      }

      return {
        pluginId: plugin.id,
        config,
      }
    })

  return {
    board,
    release,
    branch: normalizeOptionalString(coreValues.branch),
    buildMinimal: Boolean(coreValues.buildMinimal ?? true),
    buildDesktop: Boolean(coreValues.buildDesktop ?? false),
    kernelConfigure: Boolean(coreValues.kernelConfigure ?? false),
    kernelBtf: Boolean(coreValues.kernelBtf ?? false),
    hostname: normalizeOptionalString(coreValues.hostname),
    timezone,
    username: normalizeOptionalString(coreValues.username),
    userPassword: normalizeOptionalString(coreValues.userPassword),
    plugins: plugins.length > 0 ? plugins : undefined,
  }
}

function findBlockingDependents(
  plugin: ArmbianPluginDefinition,
  formConfig: ArmbianBuildFormConfig,
  enabledPlugins: Record<string, boolean>,
) {
  return formConfig.plugins.filter((candidate) => {
    if (!enabledPlugins[candidate.id]) {
      return false
    }

    return candidate.dependencies.some((dependency) => dependency.pluginId === plugin.id)
  })
}

function buildFormStateFromRequest(formConfig: ArmbianBuildFormConfig, request?: ArmbianBuildRequest | null) {
  const coreValues = getDefaultValues(formConfig.coreFields)
  const enabledPlugins: Record<string, boolean> = {}
  const pluginValues: Record<string, DynamicValues> = {}

  for (const plugin of formConfig.plugins) {
    enabledPlugins[plugin.id] = false
    pluginValues[plugin.id] = getDefaultValues(plugin.fields)
  }

  if (!request) {
    return { coreValues, enabledPlugins, pluginValues }
  }

  const setCore = (key: string, value: ArmbianConfigValue | undefined) => {
    if (value !== undefined) {
      coreValues[key] = value
    }
  }

  const boardField = formConfig.coreFields.find((field) => field.key === 'board')
  const boardOptionValues = new Set((boardField?.options ?? []).map((option) => String(option.value)))
  if (boardOptionValues.has(request.board)) {
    setCore('board', request.board)
  } else {
    setCore('board', 'custom')
    setCore('customBoard', request.board)
  }

  setCore('release', request.release)
  setCore('branch', request.branch)
  setCore('buildMinimal', request.buildMinimal ?? true)
  setCore('buildDesktop', request.buildDesktop ?? false)
  setCore('kernelConfigure', request.kernelConfigure ?? false)
  setCore('kernelBtf', request.kernelBtf ?? false)
  setCore('hostname', request.hostname)
  setCore('username', request.username)
  setCore('userPassword', request.userPassword)

  const timezoneField = formConfig.coreFields.find((field) => field.key === 'timezone')
  const timezoneOptionValues = new Set((timezoneField?.options ?? []).map((option) => String(option.value)))
  if (request.timezone) {
    if (timezoneOptionValues.has(request.timezone)) {
      setCore('timezone', request.timezone)
    } else {
      setCore('timezone', 'custom')
      setCore('customTimezone', request.timezone)
    }
  }

  const pluginSelections = new Map((request.plugins ?? []).map((selection) => [selection.pluginId, selection]))
  for (const plugin of formConfig.plugins) {
    const selected = pluginSelections.get(plugin.id)
    if (!selected) {
      continue
    }

    enabledPlugins[plugin.id] = true
    const nextValues = { ...pluginValues[plugin.id] }
    for (const [key, value] of Object.entries(selected.config ?? {})) {
      nextValues[key] = value
    }
    pluginValues[plugin.id] = nextValues
  }

  return { coreValues, enabledPlugins, pluginValues }
}

interface ArmbianBuildRequestEditorProps {
  initialRequest?: ArmbianBuildRequest | null
  title?: string
  description?: string
  submitLabel?: string
  onStarted?: (buildId: string) => void
}

export function ArmbianBuildRequestEditor({
  initialRequest,
  title = 'Build configuration',
  description = 'Use dynamic core fields and plugin modules to compose an Armbian build request.',
  submitLabel = 'Start build',
  onStarted,
}: ArmbianBuildRequestEditorProps) {
  const [coreValues, setCoreValues] = useState<DynamicValues>({})
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>({})
  const [pluginValues, setPluginValues] = useState<Record<string, DynamicValues>>({})

  const formConfigQuery = useArmbianBuildFormConfig()
  const startBuild = useStartArmbianBuild()

  const formConfig = (formConfigQuery.data ?? null) as ArmbianBuildFormConfig | null
  const initialRequestSignature = useMemo(() => JSON.stringify(initialRequest ?? null), [initialRequest])

  useEffect(() => {
    if (!formConfig) {
      return
    }

    const initialState = buildFormStateFromRequest(formConfig, initialRequest)
    setCoreValues(initialState.coreValues)
    setEnabledPlugins(initialState.enabledPlugins)
    setPluginValues(initialState.pluginValues)
  }, [formConfig, initialRequestSignature, initialRequest])

  const pluginMap = useMemo(() => {
    const map = new Map<string, ArmbianPluginDefinition>()
    for (const plugin of formConfig?.plugins ?? []) {
      map.set(plugin.id, plugin)
    }
    return map
  }, [formConfig])

  const setCoreFieldValue = (fieldKey: string, value: ArmbianConfigValue | undefined) => {
    setCoreValues((previous) => {
      const next = { ...previous }
      if (value === undefined) {
        delete next[fieldKey]
      } else {
        next[fieldKey] = value
      }
      return next
    })
  }

  const setPluginFieldValue = (pluginId: string, fieldKey: string, value: ArmbianConfigValue | undefined) => {
    setPluginValues((previous) => {
      const nextPluginValues = { ...(previous[pluginId] ?? {}) }

      if (value === undefined) {
        delete nextPluginValues[fieldKey]
      } else {
        nextPluginValues[fieldKey] = value
      }

      return {
        ...previous,
        [pluginId]: nextPluginValues,
      }
    })
  }

  const enablePluginWithDependencies = (pluginId: string) => {
    const toEnable = new Set<string>()

    const visit = (currentPluginId: string) => {
      if (toEnable.has(currentPluginId)) {
        return
      }

      const plugin = pluginMap.get(currentPluginId)
      if (!plugin) {
        return
      }

      toEnable.add(currentPluginId)
      for (const dependency of plugin.dependencies) {
        visit(dependency.pluginId)
      }
    }

    visit(pluginId)

    setEnabledPlugins((previous) => {
      const next = { ...previous }
      for (const candidate of toEnable) {
        next[candidate] = true
      }
      return next
    })

    const autoEnabled = Array.from(toEnable).filter((candidate) => candidate !== pluginId)
    if (autoEnabled.length > 0) {
      toast.info(`Auto-enabled dependency plugin(s): ${autoEnabled.join(', ')}`)
    }
  }

  const togglePlugin = (plugin: ArmbianPluginDefinition, enabled: boolean) => {
    if (!formConfig) {
      return
    }

    if (enabled) {
      enablePluginWithDependencies(plugin.id)
      return
    }

    const dependents = findBlockingDependents(plugin, formConfig, enabledPlugins)
    if (dependents.length > 0) {
      toast.error(`Cannot disable ${plugin.name}: required by ${dependents.map((item) => item.name).join(', ')}`)
      return
    }

    setEnabledPlugins((previous) => ({
      ...previous,
      [plugin.id]: false,
    }))
  }

  const renderField = (
    field: ArmbianFormField,
    values: DynamicValues,
    onChange: (value: ArmbianConfigValue | undefined) => void,
    idPrefix: string,
  ) => {
    if (!isFieldVisible(field, values)) {
      return null
    }

    const value = values[field.key] ?? field.defaultValue
    const fieldId = `${idPrefix}-${field.key}`

    if (field.type === 'select') {
      const selectValue = value === undefined ? '' : String(value)
      return (
        <div key={field.key} className='space-y-1'>
          <label htmlFor={fieldId} className='text-xs font-medium'>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
          <Select
            value={selectValue}
            onValueChange={(selectedValue) => {
              const option = field.options?.find((candidate) => String(candidate.value) === selectedValue)
              onChange(option?.value)
            }}
          >
            <SelectTrigger id={fieldId} className='w-full'>
              <SelectValue placeholder={field.placeholder ?? field.label} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={`${field.key}-${String(option.value)}`} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.description ? <p className='text-xs text-muted-foreground'>{field.description}</p> : null}
        </div>
      )
    }

    if (field.type === 'boolean') {
      return (
        <label key={field.key} htmlFor={fieldId} className='flex items-center justify-between rounded border p-3'>
          <div>
            <p className='text-sm font-medium'>{field.label}</p>
            {field.description ? <p className='text-xs text-muted-foreground'>{field.description}</p> : null}
          </div>
          <Switch
            id={fieldId}
            checked={Boolean(value)}
            onCheckedChange={(checked: boolean) => onChange(checked)}
            aria-label={field.label}
          />
        </label>
      )
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key} className='space-y-1'>
          <label htmlFor={fieldId} className='text-xs font-medium'>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
          <textarea
            id={fieldId}
            className='w-full min-h-28 rounded-md border bg-background px-3 py-2 text-sm'
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value.length > 0 ? event.target.value : undefined)}
          />
          {field.description ? <p className='text-xs text-muted-foreground'>{field.description}</p> : null}
        </div>
      )
    }

    if (field.type === 'number') {
      return (
        <div key={field.key} className='space-y-1'>
          <label htmlFor={fieldId} className='text-xs font-medium'>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
          <Input
            id={fieldId}
            type='number'
            placeholder={field.placeholder}
            value={typeof value === 'number' ? String(value) : ''}
            onChange={(event) => {
              const next = Number(event.target.value)
              onChange(Number.isFinite(next) ? next : undefined)
            }}
          />
          {field.description ? <p className='text-xs text-muted-foreground'>{field.description}</p> : null}
        </div>
      )
    }

    return (
      <div key={field.key} className='space-y-1'>
        <label htmlFor={fieldId} className='text-xs font-medium'>
          {field.label}
          {field.required ? ' *' : ''}
        </label>
        <Input
          id={fieldId}
          type={field.type === 'password' ? 'password' : 'text'}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value.length > 0 ? event.target.value : undefined)}
        />
        {field.description ? <p className='text-xs text-muted-foreground'>{field.description}</p> : null}
      </div>
    )
  }

  const handleStartBuild = async () => {
    if (!formConfig) {
      toast.error('Build form metadata is still loading')
      return
    }

    for (const field of formConfig.coreFields) {
      if (isMissingRequiredValue(field, coreValues)) {
        toast.error(`Field "${field.label}" is required`)
        return
      }
    }

    for (const plugin of formConfig.plugins) {
      if (!enabledPlugins[plugin.id]) {
        continue
      }

      const values = pluginValues[plugin.id] ?? {}
      for (const field of plugin.fields) {
        if (isMissingRequiredValue(field, values)) {
          toast.error(`Plugin "${plugin.name}" requires field "${field.label}"`)
          return
        }
      }
    }

    const request = buildRequestPayload(formConfig, coreValues, enabledPlugins, pluginValues)

    if (!request.board || request.board.trim().length === 0) {
      toast.error('Board is required')
      return
    }

    try {
      const result = await startBuild.mutateAsync(request)
      toast.success(`Armbian build started (${result.buildId.slice(0, 8)})`)
      onStarted?.(result.buildId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown build creation error'
      toast.error(`Failed to start build: ${message}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Rocket className='h-4 w-4' />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {formConfigQuery.isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading dynamic form metadata…</p>
        ) : null}

        {!formConfigQuery.isLoading && !formConfig ? (
          <p className='text-sm text-destructive'>Unable to load build form metadata.</p>
        ) : null}

        {formConfig ? (
          <>
            <div className='space-y-3'>
              <p className='text-xs uppercase tracking-wide text-muted-foreground'>Core image configuration</p>
              {formConfig.coreFields.map((field) =>
                renderField(field, coreValues, (value) => setCoreFieldValue(field.key, value), 'core'),
              )}
            </div>

            <div className='space-y-3'>
              <p className='text-xs uppercase tracking-wide text-muted-foreground'>Plugins</p>

              {formConfig.plugins.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No plugins configured.</p>
              ) : (
                <div className='space-y-3'>
                  {formConfig.plugins.map((plugin) => {
                    const enabled = Boolean(enabledPlugins[plugin.id])
                    const pluginFormValues = pluginValues[plugin.id] ?? {}

                    return (
                      <div key={plugin.id} className='rounded border p-3 space-y-2'>
                        <div className='flex items-start justify-between gap-2'>
                          <div>
                            <p className='text-sm font-semibold'>{plugin.name}</p>
                            <p className='text-xs text-muted-foreground'>{plugin.description}</p>
                            {plugin.dependencies.length > 0 ? (
                              <p className='mt-1 text-xs text-muted-foreground'>
                                Depends on: {plugin.dependencies.map((dependency) => dependency.pluginId).join(', ')}
                              </p>
                            ) : null}
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(nextValue: boolean) => togglePlugin(plugin, nextValue)}
                            aria-label={`Enable ${plugin.name}`}
                          />
                        </div>

                        {enabled ? (
                          <div className='space-y-2 border-t pt-2'>
                            {plugin.fields.length === 0 ? (
                              <p className='text-xs text-muted-foreground'>No extra settings for this plugin.</p>
                            ) : (
                              plugin.fields.map((field) =>
                                renderField(
                                  field,
                                  pluginFormValues,
                                  (value) => setPluginFieldValue(plugin.id, field.key, value),
                                  `plugin-${plugin.id}`,
                                ),
                              )
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}

        <div className='rounded border p-2 bg-muted/40'>
          <p className='text-xs font-medium mb-1'>Request preview</p>
          <pre className='text-[11px] whitespace-pre-wrap wrap-break-word'>
            {formConfig
              ? JSON.stringify(buildRequestPayload(formConfig, coreValues, enabledPlugins, pluginValues), null, 2)
              : '{}'}
          </pre>
        </div>

        <Button
          className='w-full'
          onClick={() => {
            void handleStartBuild()
          }}
          disabled={startBuild.isPending || !formConfig}
        >
          {startBuild.isPending ? 'Starting build…' : submitLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
