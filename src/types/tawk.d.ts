interface TawkAPI {
  onLoad?: () => void;
  onStatusChange?: (status: string) => void;
  onChatStarted?: () => void;
  onChatEnded?: () => void;
  onChatMinimized?: () => void;
  onChatMaximized?: () => void;
  onChatHidden?: () => void;
  onPrechatSubmit?: (data: Record<string, unknown>) => void;
  onOfflineSubmit?: (data: Record<string, unknown>) => void;
  visitor?: {
    name?: string;
    email?: string;
  };
  maximize: () => void;
  minimize: () => void;
  toggle: () => void;
  popup: () => void;
  showWidget: () => void;
  hideWidget: () => void;
  toggleVisibility: () => void;
  endChat: () => void;
  setAttributes: (
    attributes: Record<string, string | number | boolean>,
    callback?: (error: Error | null) => void
  ) => void;
  addEvent: (
    event: string,
    metadata?: Record<string, unknown>,
    callback?: (error: Error | null) => void
  ) => void;
  addTags: (tags: string[], callback?: (error: Error | null) => void) => void;
  removeTags: (tags: string[], callback?: (error: Error | null) => void) => void;
  isChatMaximized: () => boolean;
  isChatMinimized: () => boolean;
  isChatHidden: () => boolean;
  isChatOngoing: () => boolean;
  isVisitorEngaged: () => boolean;
  getWindowType: () => 'inline' | 'embedded' | 'popup';
  getStatus: () => 'online' | 'away' | 'offline';
}

interface Window {
  Tawk_API?: TawkAPI;
  Tawk_LoadStart?: Date;
}

declare const Tawk_API: TawkAPI | undefined;
declare const Tawk_LoadStart: Date | undefined;
