import { useState, useEffect } from 'react'

/**
 * Reactive media query hook.
 * @param query - CSS media query string, e.g. '(max-width: 767px)'
 * @returns true if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches
    }
    return false
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)

    // Modern API
    mql.addEventListener('change', handler)
    // Set initial value (SSR safety handled above)
    setMatches(mql.matches)

    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Convenience hook: true when viewport width < 768px (mobile) */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
