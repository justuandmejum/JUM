"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "../../../lib/useAdminAuth";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface WeeklyRow {
  dayOfWeek: number;
  closed: boolean;
  startMinutes: number;
  endMinutes: number;
}

interface Block {
  id: string;
  type: "BLOCKED" | "HOLIDAY";
  date: string;
  startMinutes: number | null;
  endMinutes: number | null;
  reason: string | null;
}

const DEFAULT_START = 9 * 60;
const DEFAULT_END = 22 * 60;

function minutesToTimeInput(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeInputToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function AdminAvailabilityPage() {
  const { csrfToken, checkedAuth } = useAdminAuth();

  const [weekly, setWeekly] = useState<WeeklyRow[]>(
    Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, closed: true, startMinutes: DEFAULT_START, endMinutes: DEFAULT_END }))
  );
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [weeklyMessage, setWeeklyMessage] = useState<string | null>(null);

  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockType, setNewBlockType] = useState<"BLOCKED" | "HOLIDAY">("BLOCKED");
  const [newBlockAllDay, setNewBlockAllDay] = useState(true);
  const [newBlockStart, setNewBlockStart] = useState("09:00");
  const [newBlockEnd, setNewBlockEnd] = useState("22:00");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [blockError, setBlockError] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);

  function refresh() {
    fetch("/api/admin/availability")
      .then((res) => res.json())
      .then((data) => {
        setWeekly((prev) =>
          prev.map((row) => {
            const existing = (data.weeklyHours ?? []).find((r: { dayOfWeek: number }) => r.dayOfWeek === row.dayOfWeek);
            return existing
              ? { dayOfWeek: row.dayOfWeek, closed: false, startMinutes: existing.startMinutes, endMinutes: existing.endMinutes }
              : { dayOfWeek: row.dayOfWeek, closed: true, startMinutes: DEFAULT_START, endMinutes: DEFAULT_END };
          })
        );
        setBlocks(data.blocks ?? []);
      });
  }

  useEffect(() => {
    if (checkedAuth) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  async function saveWeekly() {
    setSavingWeekly(true);
    setWeeklyMessage(null);
    try {
      const res = await fetch("/api/admin/availability/weekly", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken ?? "" },
        body: JSON.stringify({ days: weekly }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWeeklyMessage(data.error ?? "Could not save weekly hours.");
        return;
      }
      setWeeklyMessage("Saved.");
      refresh();
    } catch {
      setWeeklyMessage("Network error. Please try again.");
    } finally {
      setSavingWeekly(false);
    }
  }

  async function addBlock(e: React.FormEvent) {
    e.preventDefault();
    setBlockError(null);
    if (!newBlockDate) {
      setBlockError("Pick a date.");
      return;
    }
    setAddingBlock(true);
    try {
      const res = await fetch("/api/admin/availability/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken ?? "" },
        body: JSON.stringify({
          date: newBlockDate,
          type: newBlockType,
          startMinutes: newBlockAllDay ? undefined : timeInputToMinutes(newBlockStart),
          endMinutes: newBlockAllDay ? undefined : timeInputToMinutes(newBlockEnd),
          reason: newBlockReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlockError(data.error ?? "Could not add block.");
        return;
      }
      setNewBlockDate("");
      setNewBlockReason("");
      refresh();
    } catch {
      setBlockError("Network error. Please try again.");
    } finally {
      setAddingBlock(false);
    }
  }

  async function removeBlock(id: string) {
    await fetch(`/api/admin/availability/block/${id}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken ?? "" } });
    refresh();
  }

  if (!checkedAuth) {
    return (
      <section>
        <div className="wrap center">…</div>
      </section>
    );
  }

  return (
    <section>
      <div className="wrap">
        <div className="eyebrow">JUM Admin</div>
        <h2 style={{ margin: "4px 0" }}>Availability</h2>
        <p className="fine">
          <Link href="/admin">← Back to dashboard</Link>
        </p>

        <h3 style={{ marginTop: 30 }}>Weekly hours</h3>
        <p className="fine">A day with no hours set is closed — customers won&apos;t see any bookable times on it.</p>
        <div className="panel" style={{ maxWidth: "none", margin: "14px 0" }}>
          <div style={{ display: "grid", gap: 10 }}>
            {weekly.map((row, i) => (
              <div key={row.dayOfWeek} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ width: 100, fontWeight: 700 }}>{DAY_NAMES[row.dayOfWeek]}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={!row.closed}
                    onChange={(e) => {
                      const next = [...weekly];
                      next[i] = { ...row, closed: !e.target.checked };
                      setWeekly(next);
                    }}
                  />
                  Open
                </label>
                {!row.closed && (
                  <>
                    <input
                      className="field"
                      type="time"
                      style={{ width: 130 }}
                      value={minutesToTimeInput(row.startMinutes)}
                      onChange={(e) => {
                        const next = [...weekly];
                        next[i] = { ...row, startMinutes: timeInputToMinutes(e.target.value) };
                        setWeekly(next);
                      }}
                    />
                    <span>to</span>
                    <input
                      className="field"
                      type="time"
                      style={{ width: 130 }}
                      value={minutesToTimeInput(row.endMinutes)}
                      onChange={(e) => {
                        const next = [...weekly];
                        next[i] = { ...row, endMinutes: timeInputToMinutes(e.target.value) };
                        setWeekly(next);
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          {weeklyMessage && <p className="fine" style={{ marginTop: 10 }}>{weeklyMessage}</p>}
          <button className="btn primary" style={{ marginTop: 16 }} disabled={savingWeekly} onClick={saveWeekly}>
            {savingWeekly ? "…" : "Save weekly hours"}
          </button>
        </div>

        <h3 style={{ marginTop: 30 }}>Blocked dates ({blocks.length})</h3>
        <div className="panel" style={{ maxWidth: "none", margin: "14px 0" }}>
          {blocks.length === 0 ? (
            <p className="fine">No upcoming blocks.</p>
          ) : (
            <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
              {blocks.map((b) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid #e8ddc0", paddingBottom: 8 }}>
                  <span>
                    <b>{new Date(b.date).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}</b>{" "}
                    {b.startMinutes !== null ? `${minutesToTimeInput(b.startMinutes)}–${minutesToTimeInput(b.endMinutes!)}` : "All day"} · {b.type}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                  <button className="btn" onClick={() => removeBlock(b.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form className="formrow" onSubmit={addBlock}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label>
                <span>Date</span>
                <input className="field" type="date" value={newBlockDate} onChange={(e) => setNewBlockDate(e.target.value)} />
              </label>
              <label>
                <span>Type</span>
                <select className="field" value={newBlockType} onChange={(e) => setNewBlockType(e.target.value as "BLOCKED" | "HOLIDAY")}>
                  <option value="BLOCKED">Blocked</option>
                  <option value="HOLIDAY">Holiday</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={newBlockAllDay} onChange={(e) => setNewBlockAllDay(e.target.checked)} />
                All day
              </label>
              {!newBlockAllDay && (
                <>
                  <label>
                    <span>From</span>
                    <input className="field" type="time" value={newBlockStart} onChange={(e) => setNewBlockStart(e.target.value)} />
                  </label>
                  <label>
                    <span>To</span>
                    <input className="field" type="time" value={newBlockEnd} onChange={(e) => setNewBlockEnd(e.target.value)} />
                  </label>
                </>
              )}
            </div>
            <label>
              <span>Reason (optional)</span>
              <input className="field" value={newBlockReason} onChange={(e) => setNewBlockReason(e.target.value)} />
            </label>
            {blockError && (
              <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                {blockError}
              </p>
            )}
            <button className="btn primary" type="submit" disabled={addingBlock} style={{ width: "fit-content" }}>
              {addingBlock ? "…" : "Add block"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
