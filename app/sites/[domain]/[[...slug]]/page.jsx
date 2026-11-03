import { Suspense } from 'react'
import { connection } from 'next/server'

export const instant = false

async function RequestContent() {
  await connection()
  return <p>Request-time content</p>
}

export default async function Page({ params }) {
  const { domain, slug = [] } = await params

  return (
    <main>
      <h1>{`${domain}/${slug.join('/')}`}</h1>
      <Suspense fallback={<p>Loading request-time content</p>}>
        <RequestContent />
      </Suspense>
    </main>
  )
}
