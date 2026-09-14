import { useEffect, useRef, useState } from "react";

// Outside-click + Escape dismissal for any trigger/panel dropdown.
export const useDismissableMenu = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const close = () => setOpen(false);
  const toggle = () => setOpen((current) => !current);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { open, menuRef, triggerRef, close, toggle };
};