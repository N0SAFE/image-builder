/**
 * Mock environment variables for local development and testing
 * These are safe defaults that work out of the box without configuration
 */

export const mockEnv = {
    // ============================================================================
    // API Mock Environment
    // ============================================================================
    api: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/dev',
        API_PORT: '3001',
        AUTH_SECRET: 'mock-auth-secret-key-for-development-only-change-in-production',
        BETTER_AUTH_SECRET: 'mock-auth-secret-key-for-development-only-change-in-production',
        DEV_AUTH_KEY: 'mock-dev-auth-key-for-development-only',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        DEFAULT_ADMIN_EMAIL: 'admin@admin.com',
        DEFAULT_ADMIN_PASSWORD: 'adminadmin',
    },

    // ============================================================================
    // Web Mock Environment
    // ============================================================================
    web: {
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        API_URL: 'http://localhost:3001',
        NEXT_PUBLIC_API_URL: 'http://localhost:3001',
        NEXT_PUBLIC_API_PORT: '3001',
        NEXT_PUBLIC_APP_PORT: '3000',
        AUTH_SECRET: 'mock-auth-secret-key-for-development-only-change-in-production',
        BETTER_AUTH_SECRET: 'mock-auth-secret-key-for-development-only-change-in-production',
        NEXT_PUBLIC_SHOW_AUTH_LOGS: 'false',
        NEXT_PUBLIC_DEBUG: '',
        NEXT_PUBLIC_DOC_URL: 'http://localhost:3020',
        NEXT_PUBLIC_DOC_PORT: '3020',
        REACT_SCAN: 'false',
        MILLION_LINT: 'false',
        // React Scan (optional)
        REACT_SCAN_GIT_COMMIT_HASH: '',
        REACT_SCAN_GIT_BRANCH: '',
        REACT_SCAN_TOKEN: '',
    },

    // ============================================================================
    // Doc Mock Environment
    // ============================================================================
    doc: {},

    // ============================================================================
    // Load Balancer Mock Environment
    // ============================================================================
    loadBalancer: {
        LOAD_BALANCER_PORT: '3010',
        API_URL: 'http://localhost:3001',
        APP_URL: 'http://localhost:3000',
        LB_ROUTE_SECRET: 'mock-lb-route-secret-for-development-only',
        LB_ROUTE_SECRET_PREVIOUS: '',
        LB_REPORT_TTL_MS: '30000',
        LB_LOAD_REPORT_DEDUPE_TTL_MS: '120000',
        LB_LOAD_REPORT_MAX_HOPS: '2',
        LB_PEER_URLS: '',
        MESH_NODE_ID: '88888888-8888-4888-8888-888888888888',
        MESH_STREAM_SHARED_SECRET: 'mock-mesh-stream-secret-for-development-only',
    },
}

/**
 * Get mock environment for a specific app
 */
export function getMockEnv(appName: 'api' | 'web' | 'doc' | 'loadBalancer'): Record<string, string> {
    return mockEnv[appName]
}

/**
 * Get all mock environments merged
 */
export function getAllMockEnv(): Record<string, string> {
    return {
        ...mockEnv.api,
        ...mockEnv.web,
        ...mockEnv.doc,
    }
}

/**
 * Merge mock environment with existing environment
 */
export function mergeMockEnv(
    existing: Record<string, string>,
    appName?: 'api' | 'web' | 'doc'
): Record<string, string> {
    if (appName) {
        return { ...mockEnv[appName], ...existing }
    }
    return { ...getAllMockEnv(), ...existing }
}
