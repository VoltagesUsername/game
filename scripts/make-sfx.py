"""
Synthesises the video's sound effects from scratch (no samples, no licences).

    python3 scripts/make-sfx.py      -> public/sfx/*.wav  (44.1 kHz, mono, 16-bit)

Everything is generated from noise, sine waves and a plucked-string model, so the
results are original and free to use anywhere. Deterministic (fixed random seed).
"""
import os
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sfx")
rng = np.random.default_rng(1206)


# ---------------------------------------------------------------- helpers
def secs(d):
    return np.arange(int(SR * d)) / SR


def noise(d):
    return rng.standard_normal(int(SR * d))


def band(x, lo=None, hi=None, tilt=0.0, order=4):
    """Smooth band-pass / tilt filter via FFT."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** order)
    if hi:
        m *= 1 / (1 + (f / hi) ** order)
    if tilt:
        m *= (np.maximum(f, 20) / 1000) ** tilt
    return np.fft.irfft(X * m, n=len(x))


def sweep_band(x, f0, f1, q=1.6, frame=2048, hop=512):
    """Time-varying band-pass whose centre glides from f0 to f1 (overlap-add STFT)."""
    n = len(x)
    out = np.zeros(n + frame)
    win = np.hanning(frame)
    freqs = np.fft.rfftfreq(frame, 1 / SR)
    steps = max(1, (n - frame) // hop + 1)
    for i in range(steps):
        a = i * hop
        t = i / max(1, steps - 1)
        c = f0 * (f1 / f0) ** t
        lo, hi = c / q, c * q
        mask = 1 / (1 + (lo / np.maximum(freqs, 1)) ** 4) / (1 + (freqs / hi) ** 4)
        seg = x[a : a + frame]
        if len(seg) < frame:
            seg = np.pad(seg, (0, frame - len(seg)))
        out[a : a + frame] += np.fft.irfft(np.fft.rfft(seg * win) * mask, n=frame) * win
    return out[:n]


def adsr(n, attack, release, curve=2.0):
    """Rise over `attack` seconds, then fall to zero over `release` seconds."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1) ** curve
    r = np.clip(1 - (t - attack) / max(release, 1e-4), 0, 1) ** curve
    return np.where(t < attack, a, r)


def decay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def tone(freq, d, phase=0.0):
    """Sine with a (possibly time-varying) frequency in Hz."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (int(SR * d),))
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def place(dst, src, at):
    a = int(at * SR)
    if a < 0:
        src, a = src[-a:], 0
    b = min(len(dst), a + len(src))
    if b > a:
        dst[a:b] += src[: b - a]


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def fade_edges(x, ms=8):
    k = int(SR * ms / 1000)
    x[:k] *= np.linspace(0, 1, k)
    x[-k:] *= np.linspace(1, 0, k)
    return x


def loopable(x, overlap=1.0):
    """Crossfade the tail into the head so the file loops seamlessly."""
    k = int(SR * overlap)
    head, tail = x[:k].copy(), x[-k:]
    fade = np.linspace(0, 1, k)
    y = x[:-k].copy()
    y[:k] = head * fade + tail * (1 - fade)
    return y


def save(name, x, peak=0.9):
    os.makedirs(OUT, exist_ok=True)
    x = norm(x, peak)
    data = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"  {name}.wav  {len(x) / SR:.2f}s")


def bell(freq, d, partials=((1, 1, 1.4), (2.0, 0.4, 0.8), (2.76, 0.3, 0.5), (5.4, 0.15, 0.3))):
    n = int(SR * d)
    y = np.zeros(n)
    for ratio, amp, tau in partials:
        y += amp * tone(freq * ratio, d) * decay(n, tau)
    return y * adsr(n, 0.003, d, 1)


# ---------------------------------------------------------------- sounds
def wind():
    d = 31
    x = band(noise(d), lo=60, hi=900, tilt=-0.6)
    gust = band(noise(d), hi=0.35)
    gust = 0.55 + 0.45 * norm(gust, 1)
    whistle = sweep_band(noise(d), 380, 650, q=1.15) * (0.5 + 0.5 * np.sin(2 * np.pi * secs(d) / 9.0))
    return loopable(x * gust + 0.25 * whistle)


def drone():
    d = 17
    t = secs(d)
    y = (
        tone(55, d) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t))
        + 0.7 * tone(82.6, d) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t + 1))
        + 0.4 * tone(110.3, d)
        + 0.25 * tone(164.8, d) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t))
    )
    y += 0.5 * band(noise(d), lo=40, hi=260)
    return loopable(np.tanh(y * 0.8))


def whoosh(f0=380, f1=2600, d=0.95, peak_at=0.55):
    x = sweep_band(noise(d), f0, f1, q=1.5)
    return fade_edges(x * adsr(len(x), d * peak_at, d * (1 - peak_at), 2.2))


def swell():
    d = 1.8
    t = secs(d)
    x = sweep_band(noise(d), 200, 1600, q=1.4) * 0.6
    x += 0.35 * tone(220 * (1 + 0.06 * t), d) + 0.25 * tone(330 * (1 + 0.06 * t), d)
    return fade_edges(x * adsr(len(x), 1.25, 0.55, 2))


def pop():
    d = 0.16
    n = int(SR * d)
    y = tone(np.linspace(900, 620, n), d) * decay(n, 0.035)
    y += 0.3 * band(noise(d), lo=2000) * decay(n, 0.004)
    return fade_edges(y, 2)


def chime():
    return bell(1046.5, 1.9)


def shimmer():
    d = 2.2
    y = np.zeros(int(SR * d))
    for i, f in enumerate([1046.5, 1318.5, 1568.0, 2093.0]):
        place(y, bell(f, 1.6) * (0.9 - i * 0.12), i * 0.08)
    y += 0.12 * band(noise(d), lo=6000) * adsr(len(y), 0.25, 1.6, 2)
    return y


def boom():
    d = 2.6
    n = int(SR * d)
    y = tone(np.geomspace(72, 30, n), d) * decay(n, 0.9)
    y += 0.6 * band(noise(d), hi=220) * decay(n, 0.25)
    y += 0.25 * band(noise(d), lo=800, hi=4000) * decay(n, 0.03)
    return np.tanh(y * 1.6)


def drum():
    d = 0.9
    n = int(SR * d)
    y = tone(np.geomspace(98, 52, n), d) * decay(n, 0.32)
    y += 0.5 * tone(165, d) * decay(n, 0.09)
    y += 0.35 * band(noise(d), hi=1400) * decay(n, 0.03)
    return np.tanh(y * 1.4)


def clang():
    d = 0.9
    n = int(SR * d)
    y = np.zeros(n)
    for f, tau in [(1830, 0.45), (2712, 0.38), (3644, 0.3), (4830, 0.22), (6210, 0.15), (1846, 0.45)]:
        y += rng.uniform(0.5, 1) * tone(f, d, rng.uniform(0, 6)) * decay(n, tau)
    y += 1.5 * band(noise(d), lo=2000) * decay(n, 0.012)
    return fade_edges(y, 2)


def hoof_hit(d=0.14, lo=None, hi=260, body=105):
    n = int(SR * d)
    y = band(noise(d), lo=lo, hi=hi) * decay(n, 0.028)
    y += 0.8 * tone(body, d) * decay(n, 0.035)
    y += 0.15 * band(noise(d), lo=1500, hi=5000) * decay(n, 0.01)
    return y


def gallop():
    stride = 0.385
    strides = 10
    y = np.zeros(int(SR * stride * strides) + SR)
    for s in range(strides):
        for off, vel in [(0.0, 0.8), (0.075, 1.0), (0.165, 0.9)]:
            place(y, hoof_hit() * vel * rng.uniform(0.8, 1.1), s * stride + off + rng.uniform(-0.006, 0.006))
    return loopable(y[: int(SR * stride * strides) + int(SR * 0.3)], 0.3)


def walk():
    beat = 0.5
    y = np.zeros(int(SR * beat * 8) + SR)
    for b in range(8):
        for off in (0.0, 0.12):
            place(y, hoof_hit(0.12, lo=500, hi=1600, body=190) * rng.uniform(0.6, 1.0), b * beat + off)
    return loopable(y[: int(SR * beat * 8) + int(SR * 0.3)], 0.3)


def click(freqs=(3200, 5100, 7300), tau=0.012, d=0.08):
    n = int(SR * d)
    y = sum(tone(f, d, rng.uniform(0, 6)) for f in freqs) * decay(n, tau)
    return y + 0.6 * band(noise(d), lo=1500) * decay(n, 0.003)


def lock():
    y = np.zeros(int(SR * 0.4))
    place(y, click() * 0.5, 0.0)
    place(y, click((2600, 4100, 6400), 0.02) * 1.0, 0.09)
    place(y, tone(140, 0.12) * decay(int(SR * 0.12), 0.03) * 0.6, 0.09)
    return y


def unlock():
    y = np.zeros(int(SR * 0.5))
    place(y, click() * 0.7, 0.0)
    slide = band(noise(0.16), lo=2000, hi=5500) * adsr(int(SR * 0.16), 0.05, 0.11)
    place(y, slide * 0.35, 0.03)
    place(y, click((3600, 5600), 0.015) * 0.8, 0.2)
    return y


def crack():
    d = 1.5
    y = np.zeros(int(SR * d))
    t = 0.0
    while t < 1.2:
        rate = 30 + 120 * np.sin(np.pi * t / 1.2)
        t += rng.exponential(1 / rate)
        s = band(noise(0.03), lo=900, hi=4500) * decay(int(SR * 0.03), rng.uniform(0.003, 0.01))
        place(y, s * rng.uniform(0.3, 1.0), t)
    y += 0.5 * band(noise(d), hi=120) * adsr(len(y), 0.4, 1.1, 1.5)
    return y


def shatter():
    d = 2.0
    y = crack()[: int(SR * d)] * 0.6
    y = np.pad(y, (0, max(0, int(SR * d) - len(y))))
    for _ in range(70):
        f = rng.uniform(2400, 7500)
        n = int(SR * 0.25)
        place(y, tone(f, 0.25) * decay(n, rng.uniform(0.02, 0.08)) * rng.uniform(0.2, 0.7), rng.uniform(0, 0.7))
    place(y, boom()[: int(SR * 1.5)] * 0.5, 0)
    return y


def coin():
    y = np.zeros(int(SR * 0.75))
    for at, scale in [(0.0, 1.0), (0.13, 0.7)]:
        n = int(SR * 0.5)
        c = sum(a * tone(f * scale ** 0.05, 0.5, rng.uniform(0, 6)) * decay(n, tau) for f, a, tau in [(3150, 1, 0.18), (4870, 0.7, 0.12), (7200, 0.4, 0.07)])
        place(y, c * scale, at)
    return y


def twang():
    """Karplus-Strong plucked string: a bow string snapping."""
    f = 98
    d = 0.9
    n = int(SR * d)
    period = int(SR / f)
    buf = rng.uniform(-1, 1, period)
    y = np.zeros(n)
    for i in range(n):
        y[i] = buf[i % period]
        buf[i % period] = 0.996 * 0.5 * (buf[i % period] + buf[(i + 1) % period])
    y += 0.4 * band(noise(d), lo=1500, hi=6000) * decay(n, 0.01)
    return fade_edges(y, 2)


def thunk():
    d = 0.5
    n = int(SR * d)
    y = tone(np.geomspace(150, 85, n), d) * decay(n, 0.11)
    y += 0.6 * band(noise(d), lo=300, hi=1000) * decay(n, 0.035)
    return y


def birds():
    d = 2.6
    y = np.zeros(int(SR * d))
    t = 0.05
    for _ in range(6):
        dur = rng.uniform(0.05, 0.11)
        n = int(SR * dur)
        f = np.linspace(rng.uniform(2600, 3200), rng.uniform(3800, 4600), n) * (1 + 0.04 * np.sin(2 * np.pi * 45 * np.arange(n) / SR))
        place(y, tone(f, dur) * np.sin(np.pi * np.arange(n) / n) ** 2 * rng.uniform(0.5, 1), t)
        t += dur + rng.uniform(0.05, 0.4)
    return y


def scratch():
    d = 0.4
    n = int(SR * d)
    x = band(noise(d), lo=1300, hi=4200) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 55 * secs(d))))
    return fade_edges(x * adsr(n, 0.04, 0.36, 1.3))


if __name__ == "__main__":
    print("Writing sound effects to public/sfx/")
    save("wind", wind(), 0.7)
    save("drone", drone(), 0.7)
    save("whoosh", whoosh())
    save("whoosh-down", whoosh(2600, 300, 1.2, 0.35))
    save("swell", swell())
    save("pop", pop(), 0.8)
    save("chime", chime(), 0.7)
    save("shimmer", shimmer(), 0.7)
    save("boom", boom())
    save("drum", drum())
    save("clang", clang(), 0.75)
    save("gallop", gallop())
    save("walk", walk(), 0.8)
    save("lock", lock(), 0.8)
    save("unlock", unlock(), 0.8)
    save("crack", crack())
    save("shatter", shatter())
    save("coin", coin(), 0.7)
    save("twang", twang(), 0.8)
    save("thunk", thunk())
    save("birds", birds(), 0.6)
    save("scratch", scratch(), 0.7)
