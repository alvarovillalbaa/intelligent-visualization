import type { Metadata } from "next"
import type { CSSProperties, ReactNode } from "react"

import "./globals.css"
import { cn } from "@/lib/utils"

const fontVariables = {
  "--font-sans": "\"Avenir Next\", \"Nunito Sans\", \"Segoe UI\", sans-serif",
  "--font-geist-mono": "\"SFMono-Regular\", \"JetBrains Mono\", \"Menlo\", monospace",
} as CSSProperties

export const metadata: Metadata = {
  title: "Intelligent Visualization",
  description: "Import source material and turn it into slide decks, courses, and reports.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en" className={cn("font-sans")} style={fontVariables}>
      <body className="bg-background antialiased">{children}</body>
    </html>
  )
}
