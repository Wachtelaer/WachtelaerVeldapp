import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { createRapport, addReactie, type NieuwRapportInput } from '@/lib/api/rapporten';
import { sendMessage, type SendMessageInput } from '@/lib/api/chat';
import { createOpmeting, type NieuweOpmetingInput } from '@/lib/api/opmetingen';

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
  | { id: string; kind: 'submit_opmeting'; createdAt: number; payload: NieuweOpmetingInput };

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

export function getQueueLength() {
  return queue.length;
}

/** Tries to send every queued item. Leaves failures queued for the next attempt. */
export async function flushQueue() {
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
      } else {
        await createOpmeting(action.payload);
      }
    } catch {
      remaining.push(action);
    }
  }
  queue = remaining;
  await persist();
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

/** Online/offline status plus a queue that auto-flushes on reconnect. */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const queued = useQueueLength();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const nowOnline = !!state.isConnected && state.isInternetReachable !== false;
      setIsOnline((prevOnline) => {
        if (!prevOnline && nowOnline) flushQueue();
        return nowOnline;
      });
    });
    return unsub;
  }, []);

  const flushNow = useCallback(() => flushQueue(), []);

  return { isOnline, queued, flushNow };
}
