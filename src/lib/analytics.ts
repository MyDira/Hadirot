import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { gaEvent } from "./ga";

const KEY_STARTED = "analytics:post:started";
const KEY_SUCCEEDED = "analytics:post:succeeded";
const AN_DEBUG =
  (import.meta?.env?.VITE_ANALYTICS_DEBUG ??
    process.env.VITE_ANALYTICS_DEBUG) === "1";

function readBool(k: string) {
  try {
    return sessionStorage.getItem(k) === "1";
  } catch {
    return false;
  }
}

function writeBool(k: string, v: boolean) {
  try {
    if (v) {
      sessionStorage.setItem(k, "1");
    } else {
      sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export class Analytics {
  private _postingStarted = false;
  private _postingSucceeded = false;
  private _listenersBound = false;

  constructor() {
    this._postingStarted = readBool(KEY_STARTED);
    this._postingSucceeded = readBool(KEY_SUCCEEDED);
  }

  private log(...args: any[]) {
    if (AN_DEBUG) console.info("[AN]", ...args);
  }

  private emit(name: string, payload?: Record<string, any>) {
    this.log("emit", name, payload);
    try {
      gaEvent(name, payload ?? {});
    } catch {
      // noop
    }
  }

  bindLifecycleListeners() {
    if (this._listenersBound) return;
    this._listenersBound = true;

    const onHide = () => this.trackPostAbandoned({ reason: "visibilitychange" });
    const onUnload = () => this.trackPostAbandoned({ reason: "beforeunload" });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    window.addEventListener("beforeunload", onUnload);
  }

  trackPostStart(ctx: Record<string, any> = {}) {
    if (this._postingStarted) {
      this.log("skip start (already started)");
      return;
    }
    this._postingStarted = true;
    writeBool(KEY_STARTED, true);
    this.emit("listing_post_start", ctx);
  }

  trackPostSubmit(ctx: Record<string, any> = {}) {
    if (!this._postingStarted || this._postingSucceeded) {
      this.log("skip submit");
      return;
    }
    this.emit("listing_post_submit", ctx);
  }

  trackPostSuccess(ctx: Record<string, any> = {}) {
    if (!this._postingStarted) {
      this.log("skip success (not started)");
      return;
    }
    if (this._postingSucceeded) {
      this.log("skip success (already succeeded)");
      return;
    }
    this.emit("listing_post_success", ctx);
    this._postingSucceeded = true;
    writeBool(KEY_SUCCEEDED, true);
    this.resetPostingState();
  }

  trackPostAbandoned(ctx: Record<string, any> = {}) {
    if (!this._postingStarted) {
      this.log("skip abandoned (not started)");
      return;
    }
    if (this._postingSucceeded) {
      this.log("skip abandoned (already succeeded)");
      return;
    }
    this.emit("listing_post_abandoned", ctx);
    this.resetPostingState();
  }

  resetPostingState() {
    this.log("reset posting state");
    this._postingStarted = false;
    this._postingSucceeded = false;
    writeBool(KEY_STARTED, false);
    writeBool(KEY_SUCCEEDED, false);
  }

  // Generic helpers
  trackPageView(ctx: Record<string, any> = {}) {
    this.emit("page_view", ctx);
  }

  trackFilterApply(filters: Record<string, any>) {
    this.emit("filter_apply", { filters });
  }
}

let instance: Analytics | null = null;
export const analytics = (() => {
  if (!instance) instance = new Analytics();
  return instance;
})();

export const trackPageView = analytics.trackPageView.bind(analytics);
export const trackFilterApply = analytics.trackFilterApply.bind(analytics);
export const trackPostStart = analytics.trackPostStart.bind(analytics);
export const trackPostSubmit = analytics.trackPostSubmit.bind(analytics);
export const trackPostSuccess = analytics.trackPostSuccess.bind(analytics);
export const trackPostAbandoned = analytics.trackPostAbandoned.bind(analytics);
export const resetPostingState = analytics.resetPostingState.bind(analytics);

// Hook to provide user ID to analytics
export function useAnalyticsAuth() {
  const { user } = useAuth();

  React.useEffect(() => {
    (window as any).__auth_user_id = user?.id;
    return () => {
      (window as any).__auth_user_id = undefined;
    };
  }, [user?.id]);
}

export default analytics;

