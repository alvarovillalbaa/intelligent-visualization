import type { GenerationInput } from "@/lib/types"

const MAX_STORED_CONTENT = 12_000
const MAX_PREVIEW_BYTES = 250_000

export type ImportedFile = GenerationInput["files"][number] & {
  size?: number
  previewDataUrl?: string
}

export function clipContent(value: string) {
  return value.length > MAX_STORED_CONTENT ? `${value.slice(0, MAX_STORED_CONTENT)}...` : value
}

function filePreview(file: File) {
  if (!file.type.startsWith("image/") || file.size > MAX_PREVIEW_BYTES) {
    return Promise.resolve<string | undefined>(undefined)
  }

  return new Promise<string | undefined>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

async function fallbackFileContext(files: File[]): Promise<ImportedFile[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      previewDataUrl: await filePreview(file),
      content: clipContent(
        await file
          .text()
          .catch(
            () =>
              [
                `Uploaded asset: ${file.name}`,
                `Type: ${file.type || "unknown"}`,
                `Size: ${file.size} bytes`,
              ].join("\n"),
          ),
      ),
    })),
  )
}

export async function readFiles(fileList: FileList | File[] | null): Promise<ImportedFile[]> {
  const files = Array.from(fileList ?? [])
  if (!files.length) {
    return []
  }

  const formData = new FormData()
  for (const file of files) {
    formData.append("files", file)
  }

  const response = await fetch("/api/file-context", {
    method: "POST",
    body: formData,
  }).catch(() => null)

  if (!response?.ok) {
    return fallbackFileContext(files)
  }

  const payload = (await response.json()) as {
    files: Array<{ name: string; type: string; content: string }>
  }
  const previews = await Promise.all(files.map((file) => filePreview(file)))

  return payload.files.map((file, index) => ({
    ...file,
    size: files[index]?.size,
    content: clipContent(file.content),
    previewDataUrl: previews[index],
  }))
}
