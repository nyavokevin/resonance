import { AuthForm } from "@/components/auth/AuthForm";
import { getServerDictionary } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getServerDictionary();
  return { title: t.auth.loginMeta };
}

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
