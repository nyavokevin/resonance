import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024;

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (fromName && /^[a-z0-9]{2,4}$/.test(fromName)) return fromName;
  const fromType = file.type.split("/")[1]?.toLowerCase() ?? "";
  if (fromType && /^[a-z0-9+.-]{2,10}$/.test(fromType)) {
    return fromType === "jpeg" ? "jpg" : fromType;
  }
  return "png";
}

export function avatarFileError(file: File): "too_big" | "bad_type" | null {
  if (!file.type.startsWith("image/")) return "bad_type";
  if (file.size > MAX_BYTES) return "too_big";
  return null;
}

/** Upload to `avatars/{userId}/{timestamp}.{ext}` (upsert) and return the public URL. */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const kind = avatarFileError(file);
  if (kind) throw new Error(kind);
  const supabase = createClient();
  const path = `${userId}/${Date.now()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error("upload_failed");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
