import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../context/ConfirmContext";

export const useLogoutHandler = (onSuccess) => {
  const { logout } = useAuth();
  const confirm = useConfirm();

  return async () => {
    const confirmed = await confirm({
      title: "Sign out?",
      message: "You'll need to sign in again to access your account.",
      confirmLabel: "Yes, sign out",
      cancelLabel: "No, stay signed in",
    });
    if (!confirmed) return;

    try {
      await logout();
      onSuccess?.();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };
};