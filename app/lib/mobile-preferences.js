'use client';

import { useSyncExternalStore } from 'react';

const PREFERENCE_KEY = 'rk_auto_refresh';
const CHANGE_EVENT = 'rk-auto-refresh-change';

function subscribeToAutoRefresh(callback) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getAutoRefreshSnapshot() {
  return typeof window === 'undefined' || window.localStorage.getItem(PREFERENCE_KEY) !== 'false';
}

function getServerAutoRefreshSnapshot() {
  return true;
}

export function useAutoRefreshPreference() {
  return useSyncExternalStore(
    subscribeToAutoRefresh,
    getAutoRefreshSnapshot,
    getServerAutoRefreshSnapshot
  );
}

export function setAutoRefreshPreference(enabled) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFERENCE_KEY, String(Boolean(enabled)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

