import { useState } from "react";
import { LoginForm } from "../login-form";
import { RegisterForm } from "../register-form";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {mode === "login" ? (
          <LoginForm onToggleMode={() => setMode("register")} />
        ) : (
          <RegisterForm onToggleMode={() => setMode("login")} />
        )}
      </div>
    </div>
  );
}
