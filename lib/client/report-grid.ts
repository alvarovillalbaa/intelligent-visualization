// Shared by the authoring canvas and the responsive React preview.
export const REPORT_GRID_COLUMNS = { lg: 12, md: 8, sm: 4 } as const
export const REPORT_GRID_ROW_HEIGHT = 40
export const REPORT_GRID_GAP = 12
export type ReportBreakpoint = keyof typeof REPORT_GRID_COLUMNS
