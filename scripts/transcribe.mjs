// Transcribes your voiceover locally with whisper.cpp (free, offline after first run)
// and writes word-level captions to public/captions.json for Remotion.
//
// Usage:
//   npm run transcribe                       -> public/voiceover.wav (or .mp3/.m4a/...)
//   npm run transcribe -- public/take2.m4a   -> any audio/video file
//   WHISPER_MODEL=small.en npm run transcribe
//   WHISPER_LANG=ja WHISPER_MODEL=medium npm run transcribe   (non-English)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from "@remotion/install-whisper-cpp";

const WHISPER_VERSION = "1.7.6";
const WHISPER_PATH = path.resolve("whisper.cpp");
const MODEL = process.env.WHISPER_MODEL ?? "medium.en";
const LANGUAGE = process.env.WHISPER_LANG ?? null;

const findDefaultInput = () => {
  for (const ext of ["wav", "mp3", "m4a", "aac", "ogg", "flac", "webm", "mp4"]) {
    const p = path.join("public", `voiceover.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const input = process.argv[2] ?? findDefaultInput();
if (!input || !fs.existsSync(input)) {
  console.error(
    "No voiceover found. Put your recording at public/voiceover.wav (or .mp3/.m4a), " +
      "or pass a path: npm run transcribe -- path/to/file",
  );
  process.exit(1);
}

await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
// If a previous model download was interrupted, remove the broken file and retry.
const modelFile = path.join(WHISPER_PATH, `ggml-${MODEL}.bin`);
if (fs.existsSync(modelFile) && fs.statSync(modelFile).size === 0) fs.rmSync(modelFile);
await downloadWhisperModel({ model: MODEL, folder: WHISPER_PATH });

// whisper.cpp needs 16 kHz mono WAV. Use Remotion's bundled ffmpeg so nothing else is required.
const wav16k = input.replace(/\.[^.]+$/, "") + ".16k.wav";
execSync(`npx remotion ffmpeg -y -i "${input}" -ar 16000 -ac 1 "${wav16k}"`, {
  stdio: ["ignore", "ignore", "inherit"],
});

console.log(`Transcribing ${input} with model "${MODEL}"...`);
const whisperCppOutput = await transcribe({
  inputPath: wav16k,
  model: MODEL,
  modelFolder: WHISPER_PATH,
  whisperPath: WHISPER_PATH,
  whisperCppVersion: WHISPER_VERSION,
  tokenLevelTimestamps: true,
  language: LANGUAGE,
  splitOnWord: true,
  onProgress: (p) => process.stdout.write(`\r  ${Math.round(p * 100)}%`),
});
process.stdout.write("\n");

const { captions } = toCaptions({ whisperCppOutput });
fs.writeFileSync("public/captions.json", JSON.stringify(captions, null, 2));
fs.rmSync(wav16k, { force: true });
console.log(
  `Wrote ${captions.length} words to public/captions.json. ` +
    "Open it to fix any mis-heard words, then `npm run dev` or `npm run render`.",
);
