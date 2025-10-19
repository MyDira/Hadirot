import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { CustomModal } from './CustomModal';
import { modalsService, type ModalPopup } from '../../services/modals';

const FINGERPRINT_KEY = 'modal_user_fingerprint';
const SESSION_ID_KEY = 'modal_session_id';

function generateFingerprint(): string {
  const stored = localStorage.getItem(FINGERPRINT_KEY);
  if (stored) return stored;

  const fingerprint = `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  return fingerprint;
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

interface ModalManagerProps {
  userId?: string;
}

export function ModalManager({ userId }: ModalManagerProps) {
  const location = useLocation();
  const [activeModals, setActiveModals] = useState<ModalPopup[]>([]);
  const [currentModal, setCurrentModal] = useState<ModalPopup | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userFingerprint, setUserFingerprint] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [displayTimer, setDisplayTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fingerprint = generateFingerprint();
    const session = getSessionId();
    setUserFingerprint(fingerprint);
    setSessionId(session);
  }, []);

  useEffect(() => {
    const loadActiveModals = async () => {
      try {
        const modals = await modalsService.getActiveModals();
        setActiveModals(modals);
      } catch (error) {
        console.error('Error loading active modals:', error);
      }
    };

    loadActiveModals();
  }, []);

  const evaluateAndDisplayModal = useCallback(async () => {
    if (!userFingerprint || !sessionId || activeModals.length === 0) {
      return;
    }

    const currentPath = location.pathname;

    const eligibleModals = activeModals.filter((modal) => {
      const matchesPage =
        modal.trigger_pages.length === 0 ||
        modal.trigger_pages.includes('*') ||
        modal.trigger_pages.includes(currentPath) ||
        modal.trigger_pages.some((page) => {
          if (page.endsWith('*')) {
            const prefix = page.slice(0, -1);
            return currentPath.startsWith(prefix);
          }
          return false;
        });

      return matchesPage;
    });

    if (eligibleModals.length === 0) {
      return;
    }

    for (const modal of eligibleModals) {
      const shouldDisplay = await modalsService.shouldDisplayModal(
        modal,
        userFingerprint,
        sessionId,
        userId
      );

      if (shouldDisplay) {
        if (displayTimer) {
          clearTimeout(displayTimer);
        }

        const timer = setTimeout(() => {
          setCurrentModal(modal);
          setIsModalOpen(true);

          modalsService.recordModalInteraction(
            modal.id,
            userFingerprint,
            'shown',
            sessionId,
            currentPath,
            userId
          );
        }, modal.delay_seconds * 1000);

        setDisplayTimer(timer);
        break;
      }
    }
  }, [activeModals, userFingerprint, sessionId, userId, location.pathname, displayTimer]);

  useEffect(() => {
    evaluateAndDisplayModal();

    return () => {
      if (displayTimer) {
        clearTimeout(displayTimer);
      }
    };
  }, [location.pathname, activeModals, userFingerprint, sessionId]);

  const handleClose = () => {
    if (currentModal) {
      modalsService.recordModalInteraction(
        currentModal.id,
        userFingerprint,
        'dismissed',
        sessionId,
        location.pathname,
        userId
      );
    }
    setIsModalOpen(false);
    setCurrentModal(null);
  };

  const handleButtonClick = () => {
    if (currentModal) {
      modalsService.recordModalInteraction(
        currentModal.id,
        userFingerprint,
        'clicked',
        sessionId,
        location.pathname,
        userId
      );
    }
    setIsModalOpen(false);
    setCurrentModal(null);
  };

  if (!currentModal) {
    return null;
  }

  return (
    <CustomModal
      modal={currentModal}
      isOpen={isModalOpen}
      onClose={handleClose}
      onButtonClick={handleButtonClick}
    />
  );
}
