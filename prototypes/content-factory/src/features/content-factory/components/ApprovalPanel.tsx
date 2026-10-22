import { useState } from "react";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canApprove, hasValidApproval } from "../logic/gate";
import { useFactory } from "../store";
import { DELIVERY_LABEL, PLATFORMS } from "../constants";
import { IMAGES } from "../images";
import { actorName, DemoTag } from "./bits";

export function ApprovalPanel() {
  const { selected: item, state, actions, dirtyItemId } = useFactory();
  const [note, setNote] = useState("");
  if (!item) return null;
  const gate = canApprove(item, state.currentUser);
  const valid = hasValidApproval(item);
  const dirty = dirtyItemId === item.id;
  return (
    <section className="panel min-w-0 p-5" aria-labelledby="approval-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">THE HUMAN GATE</p>
          <h2 id="approval-heading" className="mt-1 text-xl font-bold">
            Final package
          </h2>
        </div>
        <ShieldCheck className="size-6 text-stage-approval" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Approve the saved video version, six captions and destinations, thumbnail, and schedule
        below. Muninn cannot approve. Connection and delivery states are simulated.
      </p>
      <div className="mt-4 flex gap-3 rounded-xl bg-secondary/70 p-3">
        <img
          className="aspect-[9/16] w-16 rounded-lg object-cover"
          src={IMAGES[item.thumbnail]}
          alt="Selected package thumbnail"
        />
        <div className="min-w-0 text-sm">
          <strong className="block">
            {item.versions.find((v) => v.id === item.selectedVersionId)?.label ??
              "No version selected"}{" "}
            · revision {item.revision}
          </strong>
          <p className="mt-1">{item.hook}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Example schedule: {item.schedule.replace("T", " at ")} · browser local time
          </p>
          <DemoTag>DEMO PACKAGE</DemoTag>
          <p className="mt-1 text-xs text-muted-foreground">
            Demo steps accelerate the schedule; nothing is booked or dispatched.
          </p>
        </div>
      </div>
      <details className="mt-3 rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Review script & scenes</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm">{item.script}</p>
        <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
          {item.scenes.map((s) => (
            <li key={s.id}>
              {s.label} · {s.duration}s · {s.source} · {s.overlay || "No overlay"}
            </li>
          ))}
        </ol>
      </details>
      <div className="mt-3 space-y-2">
        {PLATFORMS.map((p) => {
          const d = item.destinations.find((d) => d.platform === p.id);
          return (
            <details key={p.id} className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm">
                <strong>{p.label}</strong>
                <span className="ml-2 text-xs text-muted-foreground">
                  {d?.sourceOnly
                    ? "Source only · no duplicate"
                    : !d?.enabled
                      ? "Not selected"
                      : d
                        ? DELIVERY_LABEL[d.status]
                        : "Missing destination"}
                </span>
              </summary>
              <p className="mt-2 text-xs font-semibold">{d?.handle}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{item.captions[p.id]}</p>
              <p className="mt-2 text-xs text-muted-foreground">{d?.note}</p>
              {d?.receipt && (
                <p className="mt-2 break-all rounded bg-secondary p-2 text-xs">
                  SIMULATED RECEIPT · {d.receipt.id}
                  <br />
                  Example time: {new Date(d.receipt.at).toLocaleString()}
                </p>
              )}
              {d?.status === "failed" && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => actions.retryDestination(item.id, p.id)}
                >
                  Retry {p.label}
                </Button>
              )}
            </details>
          );
        })}
      </div>
      {item.staleApproval && (
        <div className="mt-4 rounded-xl bg-warning-soft p-3 text-sm" role="status">
          <strong>Previous approval is stale</strong>
          <p>
            {actorName(item.staleApproval.by)} approved revision {item.staleApproval.revision}.{" "}
            {item.staleApproval.changes.join(" · ")}. A fresh approval is required.
          </p>
        </div>
      )}
      {valid && item.approval && (
        <div className="mt-4 rounded-xl bg-success-soft p-3 text-sm" role="status">
          <Check className="mr-1 inline size-4" />
          Approved by {actorName(item.approval.by)} · revision {item.approval.revision}
          <p className="mt-1 text-xs">
            {new Date(item.approval.at).toLocaleString()} · demo approval only
          </p>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {item.stage !== "approval" && !valid ? (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => actions.move(item.id, "approval")}
          >
            Send to human review
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={!gate.ok || dirty}
            onClick={() => actions.approve(item.id)}
          >
            <LockKeyhole className="size-4" />
            Approve this version
          </Button>
        )}
        {dirty ? (
          <p role="status" className="text-xs text-primary">
            Save or discard your cockpit edits before approval.
          </p>
        ) : (
          !gate.ok &&
          !valid &&
          item.stage === "approval" && (
            <p className="text-xs text-muted-foreground">{gate.reason}</p>
          )
        )}
        {(state.factoryPaused || item.paused) && (
          <p className="text-xs text-muted-foreground">
            Dispatch is stopped while {state.factoryPaused ? "the factory" : "this item"} is paused.
          </p>
        )}
        <label className="mt-3 block text-xs font-semibold" htmlFor="change-note">
          Request changes
        </label>
        <textarea
          id="change-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-20 w-full rounded-lg border bg-card p-2 text-sm"
          placeholder="What should change before the next review?"
        />
        <Button
          variant="outline"
          className="w-full"
          disabled={!note.trim() || dirty}
          onClick={() => {
            actions.requestChanges(item.id, note.trim());
            setNote("");
          }}
        >
          Send back with note
        </Button>
      </div>
    </section>
  );
}
