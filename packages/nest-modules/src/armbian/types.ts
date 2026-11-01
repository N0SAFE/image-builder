export type ArmbianRelease = "bookworm" | "bullseye" | "jammy" | "noble";

export type ArmbianConfigValue = string | number | boolean;

export type ArmbianFormFieldType = "text" | "password" | "number" | "boolean" | "select" | "textarea";

export interface ArmbianFieldOption {
    label: string;
    value: ArmbianConfigValue;
}

export interface ArmbianFieldVisibility {
    fieldKey: string;
    equals: ArmbianConfigValue;
}

export interface ArmbianFormField {
    key: string;
    label: string;
    description?: string;
    type: ArmbianFormFieldType;
    required: boolean;
    placeholder?: string;
    defaultValue?: ArmbianConfigValue;
    options?: ArmbianFieldOption[];
    visibleWhen?: ArmbianFieldVisibility;
}

export interface ArmbianPluginDependency {
    pluginId: string;
    reason?: string;
}

export interface ArmbianPluginDefinition {
    id: string;
    name: string;
    description: string;
    category: "runtime" | "service" | "tooling" | "custom";
    dependencies: ArmbianPluginDependency[];
    fields: ArmbianFormField[];
}

export interface ArmbianBuildFormConfig {
    version: string;
    coreFields: ArmbianFormField[];
    plugins: ArmbianPluginDefinition[];
}

export interface ArmbianBuildPluginSelection {
    pluginId: string;
    config?: Record<string, ArmbianConfigValue>;
}

export interface ArmbianBuildRequest {
    board: string;
    release: ArmbianRelease;
    branch?: string;
    buildMinimal?: boolean;
    buildDesktop?: boolean;
    kernelConfigure?: boolean;
    kernelBtf?: boolean;
    wifiSsid?: string;
    wifiPassword?: string;
    hostname?: string;
    timezone?: string;
    username?: string;
    userPassword?: string;
    plugins?: ArmbianBuildPluginSelection[];
}

export interface ArmbianBuildStartResult {
    buildId: string;
    containerId: string;
    containerName: string;
    workspaceDir: string;
    artifactsDir: string;
    startedAt: string;
}

export interface ArmbianDeleteBuildResult {
    buildId: string;
    deleted: boolean;
    stoppedRunningContainer: boolean;
}

export type ArmbianBuildStatus =
    | "queued"
    | "running"
    | "success"
    | "failed"
    | "not_found";

export interface ArmbianArtifact {
    fileName: string;
    filePath: string;
    sizeBytes: number;
    createdAt: string;
}

export interface ArmbianBuildDetails {
    buildId: string;
    status: ArmbianBuildStatus;
    containerId: string | null;
    containerName: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    exitCode: number | null;
    artifacts: ArmbianArtifact[];
}

export interface ArmbianBuildMetadata {
    buildId: string;
    request: ArmbianBuildRequest;
    startedAt: string;
    containerId: string;
    containerName: string;
    workspaceDir: string;
    artifactsDir: string;
}

export interface ArmbianBuildRecord {
    buildId: string;
    details: ArmbianBuildDetails;
    request: ArmbianBuildRequest | null;
}

export interface ArmbianBuildStreamEvent {
    buildId: string;
    status: ArmbianBuildStatus;
    step: string;
    stepIndex: number;
    totalSteps: number;
    logsTail: string;
    artifacts: ArmbianArtifact[];
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
}

export interface ArmbianBuilderServiceOptions {
    workerImage?: string;
    storageRootPath?: string;
    workspaceRootPath?: string;
    cloneDepth?: number;
    buildEntrypoint?: string;
}
