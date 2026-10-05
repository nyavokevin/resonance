import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { fetchPlaylists } from "@/lib/library-server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { count: likedCount }, playlists] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("liked_tracks").select("id", { count: "exact", head: true }),
    fetchPlaylists(),
  ]);

  return (
    <Shell
      user={{
        email: user.email ?? "",
        displayName: profile?.display_name ?? user.email?.split("@")[0] ?? "",
        avatarUrl: profile?.avatar_url ?? undefined,
      }}
      likedCount={likedCount ?? 0}
      playlists={playlists}
    >
      {children}
    </Shell>
  );
}
