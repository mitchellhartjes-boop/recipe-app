import { createContext, useContext, useState, type ReactNode } from 'react'

type ThemeValue = { dark: boolean; toggle: () => void }
const ThemeContext = createContext<ThemeValue>({ dark: false, toggle: () => {} })

// Keep in sync with the no-flash inline script in index.html.
const BG = { light: '#faf8f5', dark: '#1b1714' }
const KEY = 'wedge-theme'

function applyMeta(dark: boolean) {
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', dark ? BG.dark : BG.light)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The inline script in <head> has already applied the right class before paint;
  // initialize from the DOM so there's no flash and no mismatch.
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  const toggle = () => {
    setDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem(KEY, next ? 'dark' : 'light')
      } catch {
        /* storage blocked — runtime toggle still works for the session */
      }
      applyMeta(next)
      return next
    })
  }

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext)
