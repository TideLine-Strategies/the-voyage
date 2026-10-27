import { useEffect, useRef } from "react";
// Hidden drawers and inactive tabs must not keep decoding several private videos.
export function MediaLoop(props: React.VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = false;
    let covered = false;
    const sync = () => {
      if (visible && !covered && document.visibilityState === "visible")
        void video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = !!entries[0]?.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(video);
    const cover = (e: Event) => {
      covered = Boolean((e as CustomEvent).detail.open);
      sync();
    };
    document.addEventListener("factory-presentation", cover);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("factory-presentation", cover);
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, [props.src]);
  return <video {...props} ref={ref} autoPlay muted loop playsInline preload="metadata" />;
}
