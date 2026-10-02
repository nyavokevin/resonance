import { AuthForm } from "@/components/auth/AuthForm";
import { getServerDictionary } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getServerDictionary();
  return { title: t.auth.signupMeta };
}

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
