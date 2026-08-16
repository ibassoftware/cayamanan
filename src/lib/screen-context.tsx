"use client"

// The screen-context provider (03-missy-foundation.md: "a provider publishes
// {route, module, entityType, entityId, filters} with each message"). Route/module are
// derived automatically from the current pathname; entityType/entityId/filters are opt-in —
// a domain screen (a later slice) can call `useSetScreenEntity` to focus Missy on "this
// employee" / "this payroll run", and must clear it on unmount so a stale focus never
// leaks onto the next screen.
import { usePathname } from "next/navigation"
import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { deriveRouteContext } from "@/lib/chat/screen-context"

export interface ScreenContext {
  route: string
  module: string | null
  entityType: string | null
  entityId: string | null
  filters: Record<string, unknown> | null
}

export interface ScreenEntity {
  entityType: string
  entityId: string
  filters?: Record<string, unknown>
}

interface ScreenContextValue {
  context: ScreenContext
  setEntity: (entity: ScreenEntity | null) => void
}

const ScreenContextInternal = createContext<ScreenContextValue | null>(null)

export function ScreenContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [entity, setEntity] = useState<ScreenEntity | null>(null)
  // Render-time state adjustment (see "Adjusting state when a prop changes" in the React
  // docs) instead of an effect: a screen's own entity focus never survives navigating away
  // from it, and comparing during render avoids an extra committed render just to clear it.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setEntity(null)
  }

  const value = useMemo<ScreenContextValue>(() => {
    const { route, module } = deriveRouteContext(pathname)
    return {
      context: {
        route,
        module,
        entityType: entity?.entityType ?? null,
        entityId: entity?.entityId ?? null,
        filters: entity?.filters ?? null,
      },
      setEntity,
    }
  }, [pathname, entity])

  return <ScreenContextInternal.Provider value={value}>{children}</ScreenContextInternal.Provider>
}

export function useScreenContext(): ScreenContext {
  const ctx = useContext(ScreenContextInternal)
  if (!ctx) throw new Error("useScreenContext must be used within a ScreenContextProvider")
  return ctx.context
}

/** Opt-in for a domain screen to focus Missy on a specific record. Not used by any
 * screen yet in this slice — the entity types themselves don't exist until later slices. */
export function useSetScreenEntity(): (entity: ScreenEntity | null) => void {
  const ctx = useContext(ScreenContextInternal)
  if (!ctx) throw new Error("useSetScreenEntity must be used within a ScreenContextProvider")
  return ctx.setEntity
}
