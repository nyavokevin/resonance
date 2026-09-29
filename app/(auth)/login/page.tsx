import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Connexion — Resonance" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
