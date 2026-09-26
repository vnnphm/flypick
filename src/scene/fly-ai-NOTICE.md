# fly.ai visual attribution

Pinned upstream: https://github.com/alextitonis/fly.ai/tree/40fbeca60e5c16742f20b4c2c067de915b388e66

Inspected `world/src/scene.ts` (camera, ground, fly and prop rendering) and
`world/src/sim.ts` (environment layout only). No upstream simulation is imported.

Adaptations: `fly.ts` reuses body/abdomen/eye/wing geometry and proportions for a
single fly. `createScene.ts` reuses the 52-degree perspective camera, OrbitControls
pattern, and locator ring; adds tighter camera bounds, Reset view, and pose-only
integration. Ground is continuous rather than a bounded circular field.

`habitatProps.ts` adapts the low-poly plant, fruit and rock builders and the
clustered/random radial placement pattern from the two inspected upstream files.
The deterministic distribution is local visual data and never enters the simulation.

MIT License

Copyright (c) 2026 alextitonis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
