import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

// Full-screen overlays must escape Layout's `animate-page-in` wrapper: an
// animated transform makes that div the containing block for position:fixed
// descendants — WebKit keeps it that way even after the animation ends — so a
// "fixed" overlay anchors to the page and scrolls with it (the Cook Mode
// overlap bug). Rendering into document.body makes fixed mean the screen,
// everywhere, forever. React events still bubble through the React tree.
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
