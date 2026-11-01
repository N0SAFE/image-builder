import type {
    ArmbianBuildFormConfig,
    ArmbianBuildPluginSelection,
    ArmbianConfigValue,
    ArmbianFormField,
    ArmbianPluginDefinition,
} from "./types";

interface ResolvedPluginPlanItem {
    plugin: ArmbianPluginRegistryEntry;
    config: Record<string, ArmbianConfigValue>;
}

interface ArmbianPluginRegistryEntry extends ArmbianPluginDefinition {
    buildCommands: (config: Record<string, ArmbianConfigValue>) => string[];
}

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

const sanitizeServiceName = (value: string): string => {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return normalized.length > 0 ? normalized : "service";
};

export const ARMBIAN_CORE_FORM_FIELDS: ArmbianFormField[] = [
    {
        key: "board",
        label: "Board",
        description: "Select the target board profile.",
        type: "select",
        required: true,
        defaultValue: "orangepi5",
        options: [
            { label: "Orange Pi 5", value: "orangepi5" },
            { label: "Orange Pi 5 Plus", value: "orangepi5-plus" },
            { label: "Rock Pi 4B+", value: "rockpi-4bplus" },
            { label: "Radxa Zero 3W", value: "radxa-zero3w" },
            { label: "Raspberry Pi 4", value: "rpi4b" },
            { label: "Custom board id", value: "custom" },
        ],
    },
    {
        key: "customBoard",
        label: "Custom board id",
        description: "Only used when board is set to custom.",
        type: "text",
        required: true,
        placeholder: "e.g. bananapi-m5",
        visibleWhen: {
            fieldKey: "board",
            equals: "custom",
        },
    },
    {
        key: "release",
        label: "Release",
        type: "select",
        required: true,
        defaultValue: "noble",
        options: [
            { label: "Ubuntu 24.04 (Noble)", value: "noble" },
            { label: "Ubuntu 22.04 (Jammy)", value: "jammy" },
            { label: "Debian 12 (Bookworm)", value: "bookworm" },
            { label: "Debian 11 (Bullseye)", value: "bullseye" },
        ],
    },
    {
        key: "branch",
        label: "Kernel branch",
        type: "select",
        required: false,
        defaultValue: "current",
        options: [
            { label: "current", value: "current" },
            { label: "edge", value: "edge" },
            { label: "legacy", value: "legacy" },
        ],
    },
    {
        key: "buildMinimal",
        label: "Build minimal image",
        type: "boolean",
        required: false,
        defaultValue: true,
    },
    {
        key: "buildDesktop",
        label: "Build desktop image",
        type: "boolean",
        required: false,
        defaultValue: false,
    },
    {
        key: "kernelConfigure",
        label: "Enable kernel configure",
        type: "boolean",
        required: false,
        defaultValue: false,
    },
    {
        key: "kernelBtf",
        label: "Enable kernel BTF",
        type: "boolean",
        required: false,
        defaultValue: false,
    },
    {
        key: "hostname",
        label: "Hostname",
        type: "text",
        required: false,
        defaultValue: "armbian-node",
    },
    {
        key: "timezone",
        label: "Timezone",
        type: "select",
        required: false,
        defaultValue: "UTC",
        options: [
            { label: "UTC", value: "UTC" },
            { label: "Europe/Paris", value: "Europe/Paris" },
            { label: "Europe/Berlin", value: "Europe/Berlin" },
            { label: "America/New_York", value: "America/New_York" },
            { label: "Asia/Tokyo", value: "Asia/Tokyo" },
            { label: "Custom timezone", value: "custom" },
        ],
    },
    {
        key: "customTimezone",
        label: "Custom timezone",
        type: "text",
        required: true,
        placeholder: "Region/City",
        visibleWhen: {
            fieldKey: "timezone",
            equals: "custom",
        },
    },
    {
        key: "username",
        label: "Default username",
        type: "text",
        required: false,
        defaultValue: "armbian",
    },
    {
        key: "userPassword",
        label: "Default user password",
        type: "password",
        required: false,
    },
];

const PLUGIN_REGISTRY: Record<string, ArmbianPluginRegistryEntry> = {
    "nodejs-runtime": {
        id: "nodejs-runtime",
        name: "Node.js Runtime",
        description: "Install Node.js from NodeSource with a selectable major version.",
        category: "runtime",
        dependencies: [],
        fields: [
            {
                key: "version",
                label: "Node.js major version",
                type: "select",
                required: true,
                defaultValue: "20",
                options: [
                    { label: "18 (LTS)", value: "18" },
                    { label: "20 (LTS)", value: "20" },
                    { label: "22 (Current)", value: "22" },
                ],
            },
        ],
        buildCommands: (config) => {
            const version = String(config.version ?? "20");
            return [
                `echo "[plugin:nodejs-runtime] Installing Node.js ${version}"`,
                "apt-get update",
                "DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg",
                "install -m 0755 -d /etc/apt/keyrings",
                "curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg",
                "chmod a+r /etc/apt/keyrings/nodesource.gpg",
                `echo \"deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${version}.x nodistro main\" > /etc/apt/sources.list.d/nodesource.list`,
                "apt-get update",
                "DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs",
            ];
        },
    },
    "node-app-bootstrap": {
        id: "node-app-bootstrap",
        name: "Node.js App Bootstrap",
        description: "Prepare a Node.js app directory and optional startup service scaffold.",
        category: "service",
        dependencies: [
            {
                pluginId: "nodejs-runtime",
                reason: "Node.js runtime must be installed before bootstrapping a Node app.",
            },
        ],
        fields: [
            {
                key: "appName",
                label: "App name",
                type: "text",
                required: true,
                defaultValue: "node-app",
            },
            {
                key: "appDirectory",
                label: "App directory",
                type: "text",
                required: true,
                defaultValue: "/opt/apps",
            },
            {
                key: "startupCommand",
                label: "Startup command",
                type: "text",
                required: true,
                defaultValue: "npm run start",
            },
            {
                key: "createSystemdService",
                label: "Create a systemd service file",
                type: "boolean",
                required: false,
                defaultValue: true,
            },
        ],
        buildCommands: (config) => {
            const appName = String(config.appName ?? "node-app");
            const appDirectory = String(config.appDirectory ?? "/opt/apps");
            const startupCommand = String(config.startupCommand ?? "npm run start");
            const createSystemdService = Boolean(config.createSystemdService ?? true);
            const serviceName = sanitizeServiceName(appName);
            const targetDirectory = `${appDirectory.replace(/\/$/, "")}/${appName}`;
            const packageJsonPath = `${targetDirectory}/package.json`;
            const readmePath = `${targetDirectory}/README.md`;
            const servicePath = `/etc/systemd/system/${serviceName}.service`;

            const commands = [
                `echo "[plugin:node-app-bootstrap] Preparing ${appName}"`,
                `mkdir -p ${shellQuote(targetDirectory)}`,
                `if [ ! -f ${shellQuote(packageJsonPath)} ]; then printf '%s\\n' '${JSON.stringify({
                    name: appName,
                    version: "1.0.0",
                    private: true,
                    scripts: {
                        start: startupCommand,
                    },
                })}' > ${shellQuote(packageJsonPath)}; fi`,
                `if [ ! -f ${shellQuote(readmePath)} ]; then printf '%s\\n' 'Bootstrap folder created by Armbian build plugin.' > ${shellQuote(readmePath)}; fi`,
            ];

            if (createSystemdService) {
                commands.push(
                    `cat > ${shellQuote(servicePath)} <<'SERVICE_EOF'\n[Unit]\nDescription=${appName} service\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=${targetDirectory}\nExecStart=/usr/bin/env sh -lc ${shellQuote(startupCommand)}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\nSERVICE_EOF`,
                    `mkdir -p /etc/systemd/system/multi-user.target.wants`,
                    `ln -sf ${shellQuote(servicePath)} /etc/systemd/system/multi-user.target.wants/${serviceName}.service`,
                );
            }

            return commands;
        },
    },
    "docker-cli": {
        id: "docker-cli",
        name: "Docker CLI",
        description: "Install Docker CLI tools in the generated image.",
        category: "tooling",
        dependencies: [],
        fields: [],
        buildCommands: () => [
            'echo "[plugin:docker-cli] Installing Docker CLI"',
            "apt-get update",
            "DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io",
        ],
    },
    "custom-shell": {
        id: "custom-shell",
        name: "Custom shell script",
        description: "Run a custom script during image customization.",
        category: "custom",
        dependencies: [],
        fields: [
            {
                key: "script",
                label: "Shell script",
                description: "Executed as root inside customize-image.sh",
                type: "textarea",
                required: true,
                placeholder: "apt-get update && apt-get install -y htop",
            },
        ],
        buildCommands: (config) => {
            const script = String(config.script ?? "").trim();
            if (script.length === 0) {
                return [];
            }

            return [
                "echo \"[plugin:custom-shell] Running custom script\"",
                script,
            ];
        },
    },
};

const isConfigValueTypeValid = (value: ArmbianConfigValue, field: ArmbianFormField): boolean => {
    if (field.type === "number") {
        return typeof value === "number" && Number.isFinite(value);
    }

    if (field.type === "boolean") {
        return typeof value === "boolean";
    }

    if (field.type === "select") {
        if (!field.options || field.options.length === 0) {
            return true;
        }

        return field.options.some((option) => option.value === value);
    }

    return typeof value === "string";
};

const normalizePluginConfig = (
    plugin: ArmbianPluginRegistryEntry,
    rawConfig: Record<string, ArmbianConfigValue> | undefined,
): Record<string, ArmbianConfigValue> => {
    const normalized: Record<string, ArmbianConfigValue> = {};

    for (const field of plugin.fields) {
        const rawValue = rawConfig?.[field.key];
        const fallbackValue = field.defaultValue;
        const value = rawValue ?? fallbackValue;

        if (value === undefined) {
            if (field.required) {
                throw new Error(`Plugin \"${plugin.id}\" requires field \"${field.key}\".`);
            }
            continue;
        }

        if (!isConfigValueTypeValid(value, field)) {
            throw new Error(`Plugin \"${plugin.id}\" has invalid value for field \"${field.key}\".`);
        }

        normalized[field.key] = value;
    }

    return normalized;
};

const visitPlugin = (
    pluginId: string,
    selected: Map<string, ArmbianBuildPluginSelection>,
    ordered: string[],
    visiting: Set<string>,
    visited: Set<string>,
): void => {
    if (visited.has(pluginId)) {
        return;
    }

    if (visiting.has(pluginId)) {
        throw new Error(`Circular plugin dependency detected at \"${pluginId}\".`);
    }

    visiting.add(pluginId);

    const plugin = PLUGIN_REGISTRY[pluginId];
    if (!plugin) {
        throw new Error(`Unknown plugin \"${pluginId}\".`);
    }

    for (const dependency of plugin.dependencies) {
        if (!selected.has(dependency.pluginId)) {
            throw new Error(
                `Plugin \"${plugin.id}\" requires \"${dependency.pluginId}\"${dependency.reason ? ` (${dependency.reason})` : ""}.`,
            );
        }
        visitPlugin(dependency.pluginId, selected, ordered, visiting, visited);
    }

    visiting.delete(pluginId);
    visited.add(pluginId);
    ordered.push(pluginId);
};

export const resolveArmbianPluginExecutionPlan = (
    pluginSelections?: ArmbianBuildPluginSelection[],
): ResolvedPluginPlanItem[] => {
    if (!pluginSelections || pluginSelections.length === 0) {
        return [];
    }

    const selected = new Map<string, ArmbianBuildPluginSelection>();
    for (const selection of pluginSelections) {
        selected.set(selection.pluginId, selection);
    }

    const orderedIds: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    for (const pluginId of selected.keys()) {
        visitPlugin(pluginId, selected, orderedIds, visiting, visited);
    }

    return orderedIds.map((pluginId) => {
        const plugin = PLUGIN_REGISTRY[pluginId];
        if (!plugin) {
            throw new Error(`Unknown plugin \"${pluginId}\".`);
        }

        const selection = selected.get(pluginId);
        const config = normalizePluginConfig(plugin, selection?.config);

        return {
            plugin,
            config,
        };
    });
};

export const buildArmbianCustomizeImageScript = (
    pluginSelections?: ArmbianBuildPluginSelection[],
): string | null => {
    const plan = resolveArmbianPluginExecutionPlan(pluginSelections);
    if (plan.length === 0) {
        return null;
    }

    const lines: string[] = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "echo \"customize-image start\"",
    ];

    for (const item of plan) {
        lines.push(`echo \"plugin:${item.plugin.id} start\"`);
        const commands = item.plugin.buildCommands(item.config);
        lines.push(...commands);
        lines.push(`echo \"plugin:${item.plugin.id} done\"`);
    }

    lines.push("echo \"customize-image done\"");

    return `${lines.join("\n")}\n`;
};

export const getArmbianBuildFormConfig = (): ArmbianBuildFormConfig => {
    const plugins: ArmbianPluginDefinition[] = Object.values(PLUGIN_REGISTRY).map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        category: plugin.category,
        dependencies: plugin.dependencies,
        fields: plugin.fields,
    }));

    return {
        version: "1.0.0",
        coreFields: ARMBIAN_CORE_FORM_FIELDS,
        plugins,
    };
};
