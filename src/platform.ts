// The browser platform: file picking, drag and drop, downloads, and the
// analysis worker. Everything stays in this tab. Files are handed to the
// worker as File objects and read there; results come back as plain data.

import type { Args, Method, Response } from "./protocol";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const pending = new Map<number, Pending>();
const progressListeners = new Set<(fraction: number) => void>();
let nextId = 1;

// A shared flag lets the worker notice a cancel request while it is busy.
// It needs cross-origin isolation, which the app's headers provide.
const cancelFlag =
  typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated
    ? new Int32Array(new SharedArrayBuffer(4))
    : undefined;

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});
if (cancelFlag) worker.postMessage({ type: "cancel-flag", flag: cancelFlag.buffer });

worker.onmessage = (event: MessageEvent<Response>) => {
  const message = event.data;
  if (message.type === "ready") {
    document.documentElement.dataset[message.part] = "ready";
    return;
  }
  if (message.type === "progress") {
    const fraction = message.total > 0 ? message.read / message.total : 0;
    for (const listener of progressListeners) listener(fraction);
    return;
  }
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.ok) entry.resolve(message.value);
  else entry.reject(message.error);
};
worker.onerror = () => {
  for (const entry of pending.values()) entry.reject("");
  pending.clear();
};

export function call<T, M extends Method = Method>(
  method: M,
  args: Args<M>,
): Promise<T> {
  if (cancelFlag) Atomics.store(cancelFlag, 0, 0);
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    worker.postMessage({ ...args, method, id });
  });
}

export const canCancel = cancelFlag !== undefined;

export function cancel() {
  if (cancelFlag) Atomics.store(cancelFlag, 0, 1);
}

export function onProgress(listener: (fraction: number) => void) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

/** Opens the system file picker. Resolves with no files when it is dismissed. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    // Remove inputs of earlier, dismissed pickers.
    for (const old of document.querySelectorAll("input.file-input")) old.remove();
    const input = document.createElement("input");
    input.type = "file";
    // iOS greys out files whose type it does not know, so the filter is only a
    // hint on desktop browsers. The worker validates every file anyway.
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) input.accept = accept;
    input.multiple = multiple;
    // Visually hidden rather than display:none: iOS Safari ignores clicks on
    // file inputs that are not rendered.
    input.className = "file-input";
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      resolve(files);
    };
    input.addEventListener("change", () => {
      finish([...(input.files ?? [])]);
      input.remove();
    });
    // The element stays until the next picker opens: some browsers report a
    // cancel before a late selection arrives.
    input.addEventListener("cancel", () => finish([]));
    document.body.append(input);
    input.click();
  });
}

/** Saves bytes as a local download. Nothing leaves the device. */
export function download(bytes: Uint8Array, name: string, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * Registers the service worker that keeps this build's static files for
 * offline use. A new version waits until the user agrees to reload.
 */
export function registerOffline(onUpdate: (apply: (onBlocked: () => void) => void) => void) {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  // Reload only after the user accepted an update. On the first visit the new
  // service worker also takes control, and that must not interrupt the user.
  let accepted = false;
  let disposed = false;
  let stopWatching: (() => void) | undefined;
  let replies: MessagePort | undefined;
  const controllerChanged = () => {
    if (!accepted) return;
    accepted = false;
    replies?.close();
    location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      if (disposed) return;
      const offer = (waiting: ServiceWorker) =>
        onUpdate((onBlocked) => {
          if (accepted) return;
          const channel = new MessageChannel();
          replies = channel.port1;
          channel.port1.onmessage = () => {
            accepted = false;
            channel.port1.close();
            onBlocked();
          };
          accepted = true;
          waiting.postMessage("activate-update", [channel.port2]);
        });
      if (registration.waiting && navigator.serviceWorker.controller) {
        offer(registration.waiting);
      }
      let stopInstallation: (() => void) | undefined;
      const watchInstallation = () => {
        stopInstallation?.();
        const installing = registration.installing;
        const stateChanged = () => {
          if (installing?.state === "installed" && navigator.serviceWorker.controller) {
            offer(installing);
          }
        };
        installing?.addEventListener("statechange", stateChanged);
        stopInstallation = () => installing?.removeEventListener("statechange", stateChanged);
      };
      watchInstallation();
      registration.addEventListener("updatefound", watchInstallation);
      stopWatching = () => {
        stopInstallation?.();
        registration.removeEventListener("updatefound", watchInstallation);
      };
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    stopWatching?.();
    replies?.close();
    navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
  };
}
