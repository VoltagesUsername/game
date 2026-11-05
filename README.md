# 3D Video Studio — three.js + Remotion + your voice

Make narrated 3D animation videos:

- **three.js** (via `@react-three/fiber` + `@remotion/three`) for the 3D scenes
- **Remotion** for timing, compositing and rendering to MP4
- **Your own voice** as the narrator, auto-transcribed locally with **whisper.cpp**
  into word-by-word animated captions (`@remotion/captions`)

## Requirements

- Node.js 20+ (22 recommended)
- Git and a C/C++ toolchain (needed once to compile whisper.cpp)
  - macOS: `xcode-select --install`
  - Windows: install "Desktop development with C++" from Visual Studio Build Tools
  - Linux: `sudo apt install build-essential`

## Setup

```bash
npm install
```

## Workflow

1. **Record your voice** (any app: QuickTime, Audacity, your phone…) and save it as
   `public/voiceover.wav` (`.mp3`, `.m4a`, `.ogg`, `.flac` also work).
2. **Make captions** from your recording:
   ```bash
   npm run transcribe
   ```
   First run compiles whisper.cpp and downloads the model (~1.5 GB for `medium.en`).
   Result: `public/captions.json`. Open it to fix any misheard words.
   - Faster / smaller model: `WHISPER_MODEL=small.en npm run transcribe`
   - Other languages: `WHISPER_LANG=ja WHISPER_MODEL=medium npm run transcribe`
3. **Preview & edit** in Remotion Studio:
   ```bash
   npm run dev
   ```
   The video length automatically matches your voiceover.
4. **Render**:
   ```bash
   npm run render            # 1920x1080 -> out/video.mp4
   npm run render:vertical   # 1080x1920 (Shorts/Reels/TikTok) -> out/video-vertical.mp4
   npm run still             # thumbnail -> out/thumbnail.png
   ```

## Project layout

```
src/
  Root.tsx       Compositions (landscape + vertical), auto duration from audio
  MainVideo.tsx  Layers: 3D scene + captions + your voice
  Scene3D.tsx    The three.js scene — edit this to build your animations
  Captions.tsx   TikTok-style captions with the spoken word highlighted
scripts/
  transcribe.mjs whisper.cpp -> public/captions.json
public/          Put your voiceover, images, 3D models (.glb) here
```

## Rules for 3D animation in Remotion

- Animate **only** from `useCurrentFrame()` (with `interpolate()` / `spring()`).
  Do **not** use `useFrame()` or `clock.elapsedTime` — renders would be
  non-deterministic and flicker.
- Load models with `useGLTF(staticFile("model.glb"))` from `@react-three/drei`.
- To sync an animation to a word you say, read its `startMs` in
  `public/captions.json` and convert: `frame = startMs / 1000 * fps`.
- Use `<Sequence from={...}>` to place scenes one after another.

## Troubleshooting

- **"Error creating WebGL context" when rendering**: the machine has no usable
  GPU (e.g. a cloud server). Render with software GL:
  `npx remotion render MainVideo out/video.mp4 --gl=swangle`
- **Rendering is slow / WebGL context lost**: lower concurrency in
  `remotion.config.ts` (`Config.setConcurrency(1)`).
