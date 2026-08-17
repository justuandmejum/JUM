// Thin wrapper around Daily.co's REST API — same hand-rolled-client
// approach as lib/razorpay.ts, since the surface needed (create a room,
// mint a meeting token, extend a room, delete a room) is small. Formulas
// verified directly against Daily's docs and a real API call (create
// room -> create token -> delete room), not assumed.

const DAILY_API_BASE = "https://api.daily.co/v1";

function getApiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("DAILY_API_KEY is not set.");
  return key;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" };
}

export interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
}

/** Creates a private room. `expUnix` is a Unix timestamp — Daily rejects
 * joins after this time and (with eject_at_room_exp) ejects anyone still
 * in the room. */
export async function createRoom(name: string, expUnix: number): Promise<DailyRoom> {
  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        exp: expUnix,
        max_participants: 2,
        enable_chat: false,
        eject_at_room_exp: true,
      },
    }),
  });
  if (!res.ok) throw new Error(`Daily createRoom failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Pushes out a room's expiry — used by the paid mid-call extension flow. */
export async function updateRoomExp(roomName: string, newExpUnix: number): Promise<void> {
  const res = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ properties: { exp: newExpUnix } }),
  });
  if (!res.ok) throw new Error(`Daily updateRoomExp failed (${res.status}): ${await res.text()}`);
}

export async function deleteRoom(roomName: string): Promise<void> {
  const res = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  // A room whose exp already passed 404s but is effectively already gone — not an error for our purposes.
  if (!res.ok && res.status !== 404) throw new Error(`Daily deleteRoom failed (${res.status}): ${await res.text()}`);
}

/** Mints a token scoped to one room. `isOwner` grants Daily's host
 * privileges (e.g. ejecting participants) — used for JUM's own join,
 * never the customer's. */
export async function createMeetingToken(roomName: string, userName: string, isOwner: boolean, expUnix: number): Promise<string> {
  const res = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: isOwner,
        exp: expUnix,
        eject_at_token_exp: true,
      },
    }),
  });
  if (!res.ok) throw new Error(`Daily createMeetingToken failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.token;
}
