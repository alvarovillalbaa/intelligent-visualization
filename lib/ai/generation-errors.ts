export type GenerationErrorCode = "AI_UNAVAILABLE" | "AI_GENERATION_FAILED"

const messages: Record<GenerationErrorCode, string> = {
  AI_UNAVAILABLE: "AI generation is unavailable. Configure an AI model before creating a draft.",
  AI_GENERATION_FAILED: "AI generation failed. Please try again.",
}

export class GenerationError extends Error {
  readonly code: GenerationErrorCode
  readonly status: 502 | 503

  constructor(code: GenerationErrorCode) {
    super(messages[code])
    this.name = "GenerationError"
    this.code = code
    this.status = code === "AI_UNAVAILABLE" ? 503 : 502
  }
}
