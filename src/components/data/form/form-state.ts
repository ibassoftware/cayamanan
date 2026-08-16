// Pure, framework-free helpers shared by every generated create/edit form (see
// form-field.tsx / form-footer.tsx). Mirrors the `FieldResult<T>` convention already
// used by settings-state.ts and users-state.ts so screen-specific validators compose
// with the same shape.

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

/** A required, trimmed text field — the single most common validator every model form needs. */
export function requiredString(message = "This field is required."): (raw: string) => FieldResult<string> {
  return raw => {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      return { ok: false, message }
    }
    return { ok: true, value: trimmed }
  }
}

/**
 * Shallow dirty check: true when any key present in `initial` differs in `current`
 * (`Object.is` comparison). Good enough for flat form-value records — nested
 * objects/arrays should be compared by the caller first if that distinction matters.
 */
export function isDirty<T extends Record<string, unknown>>(initial: T, current: T): boolean {
  return (Object.keys(initial) as Array<keyof T>).some(key => !Object.is(initial[key], current[key]))
}
