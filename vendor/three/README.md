Three.js 0.180.0 (r180), vendored from the official npm package under the MIT license.

Files: build/three.module.min.js, build/three.core.min.js, examples/jsm/controls/OrbitControls.js. The only change to OrbitControls.js is its import path: `three` → `./three.module.min.js`. The renderer and controls are imported only when the user opens the 3D view.
