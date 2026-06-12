// @react-three/fiber v8 augments the LEGACY global `JSX.IntrinsicElements`
// namespace, but @types/react v19 resolves JSX through `React.JSX` instead —
// so <mesh> / <ambientLight> etc. don't typecheck without this bridge. R3F v9
// ships this augmentation itself but requires React 19; drop this file when
// the React/r3f upgrade lands.
import type { ThreeElements } from '@react-three/fiber';

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}
