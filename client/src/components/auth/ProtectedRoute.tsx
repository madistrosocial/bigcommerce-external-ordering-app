import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";

type Props = {
  children: React.ReactNode;
  role?: "admin" | "agent";
};

export default function ProtectedRoute({ children, role }: Props) {
  const { currentUser } = useStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Not logged in
    if (!currentUser) {
      setLocation("/login");
      return;
    }

    // Role mismatch
    if (role && currentUser.role !== role) {
      setLocation(currentUser.role === "admin" ? "/admin" : "/catalog");
    }
  }, [currentUser, role, setLocation]);

  if (!currentUser) return null;
  if (role && currentUser.role !== role) return null;

  return <>{children}</>;
}
