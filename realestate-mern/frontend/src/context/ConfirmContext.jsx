import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

const toneStyles = {
  danger: {
    icon: '!',
    iconWrap: 'bg-brick-light text-brick',
    confirmBtn: 'bg-brick text-white hover:bg-brick/90',
  },
  default: {
    icon: '?',
    iconWrap: 'bg-brass/15 text-brass-dark',
    confirmBtn: 'btn-primary',
  },
};

export const ConfirmProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null); // { title, message, confirmLabel, cancelLabel, tone }
  const resolverRef = useRef(null);

  // Returns a Promise<boolean> - true if the user confirmed, false if they
  // cancelled (Escape, backdrop click, or the Cancel button).
  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        title: 'Are you sure?',
        message: '',
        confirmLabel: 'Yes',
        cancelLabel: 'No',
        tone: 'default',
        ...options,
      });
    });
  }, []);

  const close = (result) => {
    setDialog(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  const tone = toneStyles[dialog?.tone] || toneStyles.default;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="absolute inset-0 bg-navy-dark/60" onClick={() => close(false)} />
          <div className="relative bg-white rounded-sm shadow-lifted max-w-sm w-full p-6">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display text-lg mb-4 ${tone.iconWrap}`}>
              {tone.icon}
            </div>
            <h2 id="confirm-dialog-title" className="font-display text-xl text-navy mb-2">{dialog.title}</h2>
            {dialog.message && <p className="text-sm text-slate-muted leading-relaxed mb-6">{dialog.message}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => close(false)} className="btn-secondary text-sm px-4 py-2">
                {dialog.cancelLabel}
              </button>
              <button type="button" onClick={() => close(true)} className={`text-sm px-4 py-2 rounded-sm font-medium transition-colors ${tone.confirmBtn}`}>
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);
