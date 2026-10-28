import { useEffect, useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { createRapport, addReactie, type NieuwRapportInput } from '@/lib/api/rapporten';
import { sendMessage, type SendMessageInput } from '@/lib/api/chat';
import { createOpmeting, type NieuweOpmetingInput } from '@/lib/api/opmetingen';
import { createAanvraag, type NieuweVerlofaanvraagInput } from '@/lib/api/verlof';
import { createMelding, type NieuweMeldingInput } from '@/lib/api/magazijn';
import { createFormulier, type NieuwFormulierInput } from '@/lib/api/formulieren';

const STORAGE_KEY = 'wachtelaer.offlineQueue.v1';

type QueuedAction =
  | { id: string; kind: 'submit_rapport'; createdAt: number; payload: NieuwRapportInput }
  | {
      id: string;
      kind: 'submit_reactie';
      createdAt: number;
      payload: { rapportId: string; auteurId: string; tekst: string };
    }
  | { id: string; kind: 'submit_chat_bericht'; createdAt: number; payload: SendMessageInput }
  | { id: string; kind: 'submit_opmeting'; createdAt: number; payload: NieuweOpmetingInput }
  | { id: string; kind: 'submit_verlofaanvraag'; createdAt: number; payload: NieuweVerlofaanvraagInput }
  | { id: string; kind: 'submit_magazijn_melding'; createdAt: number; payload: NieuweMeldingInput }
  | { id: string; kind: 'submit_formulier'; createdAt: number; payload: NieuwFormulierInput };

let queue: QueuedAction[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function hydrate() {
  if (hydrated) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  queue = raw ? JSON.parse(raw) : [];
  hydrated = true;
  notify();
}

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  notify();
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueueRapport(payload: NieuwRapportInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_rapport', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueReactie(payload: { rapportId: string; auteurId: string; tekst: string }) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_reactie', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueChatBericht(payload: SendMessageInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_chat_bericht', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueOpmeting(payload: NieuweOpmetingInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_opmeting', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueVerlofaanvraag(payload: NieuweVerlofaanvraagInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_verlofaanvraag', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueMagazijnMelding(payload: NieuweMeldingInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_magazijn_melding', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueFormulier(payload: NieuwFormulierInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_formulier', createdAt: Date.now(), payload }];
  await persist();
}

export function getQueueLength() {
  return queue.length;
}

let flushInFlight: Promise<void> | null = null;

/** Tries to send every queued item. Leaves failures queued for the next
 *  attempt. Coalesces overlapping calls (startup + reconnect can fire at
 *  nearly the same time) into a single in-flight run instead of racing two
 *  flushes against the same queue. */
export async function flushQueue() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    await hydrate();
    const remaining: QueuedAction[] = [];
    for (const action of queue) {
      try {
        if (action.kind === 'submit_rapport') {
          await createRapport(action.payload);
        } else if (action.kind === 'submit_reactie') {
          await addReactie(action.payload.rapportId, action.payload.auteurId, action.payload.tekst);
        } else if (action.kind === 'submit_chat_bericht') {
          await sendMessage(action.payload);
        } else if (action.kind === 'submit_opmeting') {
          await createOpmeting(action.payload);
        } else if (action.kind === 'submit_verlofaanvraag') {
          await createAanvraag(action.payload);
        } else if (action.kind === 'submit_magazijn_melding') {
          await createMelding(action.payload);
        } else {
          await createFormulier(action.payload);
        }
      } catch {
        remaining.push(action);
      }
    }
    queue = remaining;
    await persist();
  })();
  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

export function useQueueLength() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      hydrate();
      return () => listeners.delete(onChange);
    },
    () => queue.length,
    () => 0
  );
}

// ---------------------------------------------------------------------------
// Connectivity — a single, app-wide watcher instead of a per-screen one.
//
// Earlier version ran this entirely inside useConnectivity()'s own
// useEffect, with isOnline starting at `true` on every mount and only
// flushing on an observed false→true transition. Since every screen
// renders its own <AppHeader> (which calls useConnectivity()), a fresh
// hook instance — and a fresh "isOnline = true" — was created on every
// navigation, so the transition that triggers a flush almost never
// actually got observed in the wild: a tech filling in a form offline,
// then only regaining signal on a *different* screen (or after reopening
// the app later, already online), left the item stuck in AsyncStorage
// forever with no further attempt ever made. Confirmed live: 13
// technicians have the "formulieren" feature, but only 1 has ever had a
// submission actually reach the formulieren table — exactly the signature
// of queued items silently never being retried.
//
// Fixed by moving the NetInfo subscription + flush trigger to a single
// module-level watcher (started once, from the root layout), which:
//   - flushes immediately on startup if already online (covers "closed the
//     app offline, reopened later with a connection"), and
//   - flushes on EVERY online reading thereafter, not just a transition
//     (covers "went online on a different screen than the one queued it").
// ---------------------------------------------------------------------------

let isOnlineGlobal = true;
const onlineListeners = new Set<() => void>();
let watcherStarted = false;

function notifyOnline() {
  for (const l of onlineListeners) l();
}

function setOnline(next: boolean) {
  if (next === isOnlineGlobal) {
    if (next) flushQueue();
    return;
  }
  isOnlineGlobal = next;
  notifyOnline();
  if (next) flushQueue();
}

/** Starts the single, app-wide connectivity watcher. Safe to call many
 *  times (e.g. once per AppHeader mount) — only the first call does
 *  anything. Call this as early as possible (root layout) so a flush is
 *  attempted on every app launch, not just when a screen happens to catch
 *  a live reconnect. */
export function startConnectivityWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;

  NetInfo.fetch().then((state) => {
    setOnline(!!state.isConnected && state.isInternetReachable !== false);
  });

  NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected && state.isInternetReachable !== false);
  });
}

function useQueueOnline() {
  return useSyncExternalStore(
    (onChange) => {
      onlineListeners.add(onChange);
      return () => onlineListeners.delete(onChange);
    },
    () => isOnlineGlobal,
    () => true
  );
}

/** Online/offline status plus a queue that auto-flushes on reconnect (and
 *  on startup — see startConnectivityWatcher above). */
export function useConnectivity() {
  useEffect(() => {
    startConnectivityWatcher();
  }, []);

  const isOnline = useQueueOnline();
  const queued = useQueueLength();
  const flushNow = useCallback(() => flushQueue(), []);

  return { isOnline, queued, flushNow };
}
