require('next/dist/server/node-environment')

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { createServer, request } = require('node:http')
const NextServer = require('next/dist/server/next-server').default
const { getRequestMeta } = require('next/dist/server/request-meta')

const placeholders = 'nxtPdomain=%5Bdomain%5D&nxtPslug=%5B%5B...slug%5D%5D'
const routePattern = '/sites/[domain]/[[...slug]]'
const cases = [
  { name: 'public root, no routing query', path: '/', slug: '' },
  {
    name: 'public root, concrete routing query',
    path: '/?nxtPdomain=runtime.example',
    slug: '',
  },
  {
    name: 'public root, placeholder routing query',
    path: `/?${placeholders}`,
    slug: '',
  },
  {
    name: 'public article, placeholder routing query',
    path: `/article?${placeholders}`,
    slug: 'article',
  },
  {
    name: 'concrete internal URL, placeholder routing query',
    path: `/sites/runtime.example?${placeholders}`,
    slug: '',
  },
]

/** Sends a platform-shaped resume with real build-generated state, not a fabricated body. */
async function sendResume(port, test, postponed) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: test.path,
        method: 'POST',
        headers: {
          host: 'runtime.example',
          'next-resume': '1',
          'x-matched-path': routePattern,
          'x-nextjs-rewritten-path': `/sites/runtime.example${test.slug ? `/${test.slug}` : ''}`,
          'content-length': Buffer.byteLength(postponed),
        },
        signal: AbortSignal.timeout(10000),
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('error', reject)
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )

    req.on('error', reject)
    req.end(postponed)
  })
}

/** Mirrors @vercel/next's minimal-mode launcher; all requests and data stay on loopback. */
async function main() {
  const { config } = JSON.parse(readFileSync('.next/required-server-files.json', 'utf8'))
  const { postponed } = JSON.parse(
    readFileSync(`.next/server/app${routePattern}.meta`, 'utf8'),
  )
  assert.equal(typeof postponed, 'string', 'Build must emit postponed state')
  assert.ok(postponed.length > 0, 'Build must emit non-empty postponed state')

  const nextServer = new NextServer({
    conf: config,
    dir: '.',
    minimalMode: true,
    customServer: false,
  })
  const handler = nextServer.getRequestHandler()
  const server = createServer(async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      // Expose the framework failure to the client assertion rather than leaving HTTP open.
      if (!res.headersSent) res.statusCode = 500
      if (!res.writableEnded) res.end(error instanceof Error ? error.message : String(error))
    } finally {
      console.log('Resolved route:', JSON.stringify({
        params: getRequestMeta(req, 'params'),
        rewrittenPathname: getRequestMeta(req, 'rewrittenPathname'),
      }))
    }
  })

  const failures = []

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address !== 'string', 'Expected a loopback TCP listener')

    for (const test of cases) {
      const result = await sendResume(address.port, test, postponed)
      console.log(`${result.status} ${test.name}`)

      try {
        assert.equal(result.status, 200, `${test.name}: ${result.body}`)
        assert.ok(
          result.body.includes(`runtime.example/${test.slug}`),
          `${test.name}: response must render the concrete tenant and path`,
        )
      } catch (error) {
        failures.push(error)
      }
    }
  } finally {
    server.closeAllConnections()
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
    await nextServer.close()
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length}/${cases.length} resume cases failed`)
  }

  console.log(`All ${cases.length} resume cases rendered the expected tenant and path.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
