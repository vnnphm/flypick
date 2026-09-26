# Third-party notices

## fly.ai (MIT)

Source: https://github.com/alextitonis/fly.ai at commit `40fbeca60e5c16742f20b4c2c067de915b388e66`.

Reused:

- `world/src/connectome.ts` → `src/brain/connectome.ts` (added `reset(seed)`)
- `world/src/rng.ts` → `src/brain/rng.ts` (added `subSeed`)
- `fetchGz` from `world/src/connectome.worker.ts` → `src/brain/loadModel.ts`
- The LC10a chase formula and FOV from `world/src/eyes.ts`, and the DNa02 L − R steering readout
  from `world/src/wiz.ts`, reimplemented in `src/simulation/geometry.ts` and `src/brain/adapter.ts`
- Model files `world/public/connectome/{brain.json,meta.bin,weights.0.bin,weights.1.bin}`, downloaded
  by `npm run fetch:connectome` (sha256-checked, not committed)

```
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
```

## Connectome data

The model files are fly.ai's `flybrain export --web` of the MaleCNS v1.0 connectome (166,700
neurons, 25.1 M synapses after dropping synapses onto sensory neurons; weights stored on an 8-bit
log scale, mean error 2.3%). The connectome itself comes from the MaleCNS release by Janelia
Research Campus / FlyEM and collaborators (https://male-cns.janelia.org); check that release's
terms before redistributing the files.
