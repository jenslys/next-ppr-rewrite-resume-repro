export default {
  cacheComponents: true,
  partialPrefetching: false,
  async rewrites() {
    const tenantHostPattern = '^(?<tenantDomain>[A-Za-z0-9.-]+)(?:\\:\\d+)?$'

    return {
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: tenantHostPattern }],
          destination: '/sites/:tenantDomain',
        },
        {
          source: '/:path((?!sites|_next)(?!.*\\.).*)',
          has: [{ type: 'host', value: tenantHostPattern }],
          destination: '/sites/:tenantDomain/:path',
        },
      ],
    }
  },
}
