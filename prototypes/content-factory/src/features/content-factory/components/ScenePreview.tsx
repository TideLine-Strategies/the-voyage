import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useFactory } from "../store";
import { IMAGES } from "../images";
import { Button } from "@/components/ui/button";
import { DemoTag } from "./bits";
export function ScenePreview() {
  const { selected: item } = useFactory();
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setScene(0);
    setPlaying(false);
  }, [item?.id]);
  useEffect(() => {
    if (!playing || !item) return;
    const timer = setTimeout(
      () => setScene((n) => (n + 1) % item.scenes.length),
      (item.scenes[scene]?.duration ?? 4) * 1000,
    );
    return () => clearTimeout(timer);
  }, [playing, scene, item]);
  if (!item) return null;
  const current = item.scenes[scene];
  return (
    <section
      className="panel mb-4 grid min-w-0 gap-5 p-4 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]"
      aria-label="Selected storyboard preview"
    >
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-xl bg-ink">
        <img
          className="size-full object-cover"
          src={IMAGES[current?.image ?? item.thumbnail]}
          alt={current?.label ?? item.title}
        />
        <div className="scrim absolute inset-0" />
        <div className="absolute inset-x-3 bottom-4 text-center text-white">
          <p className="font-serif text-xl italic">{current?.overlay || item.hook}</p>
          <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest">
            {item.brand} · illustrative scene
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center">
        <div>
          <DemoTag>STORYBOARD PREVIEW</DemoTag>
          <h2 className="mt-3 text-xl font-bold">{item.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{item.subtitle || item.goal}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Simulated scenes and caption overlays. No rendered video or real footage is implied.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlaying((p) => !p)}
            disabled={!item.scenes.length}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? "Pause storyboard" : "Play storyboard"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Scene {scene + 1} / {item.scenes.length}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {item.scenes.map((s, i) => (
            <button
              key={s.id}
              aria-label={`Preview scene ${i + 1}: ${s.label}`}
              aria-pressed={scene === i}
              onClick={() => setScene(i)}
              className={`aspect-[9/16] overflow-hidden rounded-md ${scene === i ? "ring-2 ring-primary ring-offset-2" : "opacity-70"}`}
            >
              <img src={IMAGES[s.image]} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
