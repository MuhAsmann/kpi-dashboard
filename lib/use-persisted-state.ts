"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * `useState`-like hook whose value is persisted to `localStorage` under `key`.
 *
 * Reading `localStorage` during the initial render would cause a hydration
 * mismatch (server-rendered markup has no access to it), so the saved value
 * is loaded in an effect that runs once after mount. Writes are suppressed
 * until that initial load has completed, so they never clobber a saved value
 * with the default before it's had a chance to be restored.
 *
 * `isValid` lets callers defensively validate the parsed JSON shape (e.g. to
 * guard against a stale schema from a previous version of the app) before it
 * is accepted; values that fail validation are ignored and the default is
 * kept.
 *
 * The third tuple element is `true` once the initial load has run. Callers
 * that fetch data based on this state should gate that fetch on it — firing
 * once immediately with the default value and again when the persisted value
 * loads races both requests, and if the default-value one resolves second it
 * silently overwrites the correctly-filtered result.
 */
export function usePersistedState<T>(
    key: string,
    defaultValue: T,
    isValid?: (value: unknown) => value is T
): [T, Dispatch<SetStateAction<T>>, boolean] {
    const [state, setState] = useState<T>(defaultValue);
    const [loaded, setLoaded] = useState(false);

    // Load once on mount.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (!isValid || isValid(parsed)) {
                    // Intentional: synchronizing state with an external system
                    // (localStorage) on mount, which can only be read client-side.
                    // eslint-disable-next-line react-hooks/set-state-in-effect
                    setState(parsed as T);
                }
            }
        } catch {
            // localStorage unavailable or value corrupt — fall back to default.
        }
        setLoaded(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // Persist on change, but only after the initial load has run.
    useEffect(() => {
        if (!loaded) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(state));
        } catch {
            // localStorage unavailable (e.g. private browsing) — ignore.
        }
    }, [key, state, loaded]);

    return [state, setState, loaded];
}
