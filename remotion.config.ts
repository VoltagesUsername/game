import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// three.js needs WebGL. "angle" works on most machines (incl. headless Linux).
Config.setChromiumOpenGlRenderer("angle");
// Rendering WebGL is GPU-heavy; keep concurrency modest to avoid context loss.
Config.setConcurrency(2);
