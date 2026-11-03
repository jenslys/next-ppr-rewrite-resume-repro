// Unknown tenant roots may block; this does not disable the PPR resume protocol.
export const instant = false

export function generateStaticParams() {
  return [{ domain: 'built.example', slug: [] }]
}

export default async function RootLayout({ params, children }) {
  const { domain } = await params

  return (
    <html lang="en">
      <body>
        <header>{domain}</header>
        {children}
      </body>
    </html>
  )
}
