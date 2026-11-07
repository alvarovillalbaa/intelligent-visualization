import type { AssetRecord } from "@/lib/types"

export function PublishedAttachments({ assets }: { assets: AssetRecord[] }) {
  if (!assets.length) return null
  return (
    <section aria-label="Published attachments" className="mx-auto grid w-full max-w-5xl gap-3 px-6 py-8">
      <h2 className="text-lg font-semibold">Attachments</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => (
          <li key={asset.id}>
            <a href={asset.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-foreground/10 p-4 hover:bg-foreground/5">
              <span className="font-medium">{asset.title}</span>
              {asset.description ? <p className="mt-1 text-sm text-muted-foreground">{asset.description}</p> : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
