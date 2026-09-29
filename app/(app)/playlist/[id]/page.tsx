import { notFound } from "next/navigation";
import { fetchPlaylist } from "@/lib/library-server";
import { PlaylistView } from "@/components/PlaylistView";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchPlaylist(id);
  if (!data) notFound();
  return <PlaylistView initial={data} />;
}
