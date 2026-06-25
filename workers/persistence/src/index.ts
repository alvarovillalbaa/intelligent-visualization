interface D1Binding {
  prepare(sql: string): {
    first<T>(): Promise<T | null>
  }
}

export interface Env {
  DB: D1Binding
  CLOUDFLARE_DATA_API_SECRET?: string
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/internal/v1/health") {
      const result = await env.DB.prepare("SELECT 1 as ok").first<{ ok: number }>()
      return Response.json({
        ok: result?.ok === 1,
        provider: "cloudflare",
        checkedAt: new Date().toISOString(),
      })
    }

    return Response.json(
      {
        error: "Cloudflare persistence RPC is not implemented in this build slice.",
      },
      { status: 501 },
    )
  },
}

export default worker
