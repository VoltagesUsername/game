import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  watchStaticFile,
} from "remotion";
import {
  Caption,
  TikTokPage,
  createTikTokStyleCaptions,
} from "@remotion/captions";

// How long one caption "page" can be. Higher = more words on screen at once.
const COMBINE_TOKENS_WITHIN_MS = 1200;
const HIGHLIGHT = "#ffd400";

export const Captions: React.FC<{ src: string }> = ({ src }) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => delayRender("Loading captions"));
  const { fps } = useVideoConfig();

  const load = useCallback(async () => {
    try {
      const res = await fetch(staticFile(src));
      // No captions yet (haven't run `npm run transcribe`) -> render without them.
      setCaptions(res.ok ? ((await res.json()) as Caption[]) : []);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [handle, src]);

  useEffect(() => {
    load();
    // Live-reload captions in the Studio when you re-run transcribe.
    const { cancel } = watchStaticFile(src, () => load());
    return () => cancel();
  }, [load, src]);

  const pages = useMemo(
    () =>
      captions
        ? createTikTokStyleCaptions({
            captions,
            combineTokensWithinMilliseconds: COMBINE_TOKENS_WITHIN_MS,
          }).pages
        : [],
    [captions],
  );

  return (
    <AbsoluteFill>
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const from = Math.floor((page.startMs / 1000) * fps);
        const endMs = next ? next.startMs : page.startMs + page.durationMs;
        const duration = Math.max(1, Math.ceil(((endMs - page.startMs) / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const pop = interpolate(frame, [0, 5], [0.85, 1], { extrapolateRight: "clamp" });
  const fontSize = Math.round(Math.min(width, height) * 0.075);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: height * 0.12,
      }}
    >
      <div
        style={{
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          fontWeight: 900,
          fontSize,
          color: "white",
          textAlign: "center",
          whiteSpace: "pre-wrap",
          maxWidth: width * 0.85,
          transform: `scale(${pop})`,
          WebkitTextStroke: `${fontSize * 0.06}px black`,
          paintOrder: "stroke",
          textShadow: "0 6px 24px rgba(0,0,0,0.6)",
        }}
      >
        {page.tokens.map((t) => {
          const active = t.fromMs <= nowMs && nowMs < t.toMs;
          return (
            <span key={t.fromMs} style={{ color: active ? HIGHLIGHT : "white" }}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
