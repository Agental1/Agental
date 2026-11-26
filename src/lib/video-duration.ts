/**
 * Reads a video's length from its metadata, in the browser. Recorded webm files
 * often report Infinity until the end is reached, so we seek far ahead once to
 * make the browser find it. Resolves null when the length cannot be read.
 */
export function readVideoDuration(url: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return finish(video.duration);
      video.onseeked = () => finish(Number.isFinite(video.duration) ? video.duration : null);
      video.currentTime = 1e9;
    };
    video.src = url;
  });
}
