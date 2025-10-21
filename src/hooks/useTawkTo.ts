import { useEffect, useRef, useState } from 'react';

interface TawkToConfig {
  onLoad?: () => void;
  onChatStarted?: () => void;
  onChatEnded?: () => void;
  hideOnPages?: string[];
  showOnPages?: string[];
}

interface UseTawkToReturn {
  isLoaded: boolean;
  maximize: () => void;
  minimize: () => void;
  toggle: () => void;
  showWidget: () => void;
  hideWidget: () => void;
  setAttributes: (attributes: Record<string, string | number | boolean>) => void;
  addEvent: (event: string, metadata?: Record<string, unknown>) => void;
  setVisitor: (name: string, email: string) => void;
}

export function useTawkTo(config: TawkToConfig = {}): UseTawkToReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const checkTawkReady = () => {
      if (window.Tawk_API) {
        setIsLoaded(true);

        if (configRef.current.onLoad) {
          configRef.current.onLoad();
        }

        if (configRef.current.onChatStarted) {
          window.Tawk_API.onChatStarted = configRef.current.onChatStarted;
        }

        if (configRef.current.onChatEnded) {
          window.Tawk_API.onChatEnded = configRef.current.onChatEnded;
        }
      }
    };

    if (window.Tawk_API) {
      checkTawkReady();
    } else {
      const interval = setInterval(() => {
        if (window.Tawk_API) {
          checkTawkReady();
          clearInterval(interval);
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        console.warn('[useTawkTo] Tawk.to script failed to load within timeout');
      }, 10000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.Tawk_API) return;

    const currentPath = window.location.pathname;

    if (configRef.current.hideOnPages?.some(page => currentPath.includes(page))) {
      window.Tawk_API.hideWidget();
    } else if (configRef.current.showOnPages?.some(page => currentPath.includes(page))) {
      window.Tawk_API.showWidget();
    }
  }, [isLoaded, window.location.pathname]);

  const maximize = () => {
    if (window.Tawk_API?.maximize) {
      window.Tawk_API.maximize();
    }
  };

  const minimize = () => {
    if (window.Tawk_API?.minimize) {
      window.Tawk_API.minimize();
    }
  };

  const toggle = () => {
    if (window.Tawk_API?.toggle) {
      window.Tawk_API.toggle();
    }
  };

  const showWidget = () => {
    if (window.Tawk_API?.showWidget) {
      window.Tawk_API.showWidget();
    }
  };

  const hideWidget = () => {
    if (window.Tawk_API?.hideWidget) {
      window.Tawk_API.hideWidget();
    }
  };

  const setAttributes = (attributes: Record<string, string | number | boolean>) => {
    if (window.Tawk_API?.setAttributes) {
      window.Tawk_API.setAttributes(attributes, (error) => {
        if (error) {
          console.error('[useTawkTo] Failed to set attributes:', error);
        }
      });
    }
  };

  const addEvent = (event: string, metadata?: Record<string, unknown>) => {
    if (window.Tawk_API?.addEvent) {
      window.Tawk_API.addEvent(event, metadata, (error) => {
        if (error) {
          console.error('[useTawkTo] Failed to add event:', error);
        }
      });
    }
  };

  const setVisitor = (name: string, email: string) => {
    if (window.Tawk_API) {
      window.Tawk_API.visitor = {
        name,
        email,
      };
    }
  };

  return {
    isLoaded,
    maximize,
    minimize,
    toggle,
    showWidget,
    hideWidget,
    setAttributes,
    addEvent,
    setVisitor,
  };
}
