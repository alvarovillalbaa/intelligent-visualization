import { BarChart3Icon, GraduationCapIcon, PresentationIcon } from "lucide-react"

import type { VisualizationKind } from "@/packages/domain/entities"

export const visualizationOptions: Array<{
  kind: VisualizationKind
  label: string
  detail: string
  icon: typeof PresentationIcon
}> = [
  {
    kind: "slides",
    label: "Slides deck",
    detail: "A narrative sequence for presenting, pitching, or publishing.",
    icon: PresentationIcon,
  },
  {
    kind: "course",
    label: "Course",
    detail: "A lesson structure with objectives, explanation, and practice.",
    icon: GraduationCapIcon,
  },
  {
    kind: "report",
    label: "Report",
    detail: "A decision document with summary, evidence, and visual blocks.",
    icon: BarChart3Icon,
  },
]

export function visualizationKindLabel(kind: VisualizationKind) {
  return visualizationOptions.find((option) => option.kind === kind)?.label ?? kind
}
