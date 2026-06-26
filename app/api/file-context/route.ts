import { NextResponse } from "next/server"

import { extractFileContext } from "@/lib/file-context"

const MAX_FILES = 12
const MAX_FILE_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024

export async function POST(request: Request) {
  const formData = await request.formData()
  const files = formData.getAll("files").filter((value): value is File => value instanceof File)

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 })
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload up to ${MAX_FILES} files at a time.` }, { status: 413 })
  }

  const oversized = files.find((file) => file.size > MAX_FILE_BYTES)
  if (oversized) {
    return NextResponse.json({ error: `${oversized.name} is too large for import.` }, { status: 413 })
  }

  const extracted = await Promise.all(files.map((file) => extractFileContext(file)))
  return NextResponse.json({ files: extracted })
}
