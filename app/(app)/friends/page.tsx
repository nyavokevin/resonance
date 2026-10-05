import { Suspense } from "react";
import { FriendsView } from "@/components/FriendsView";

export default function FriendsPage() {
  return (
    <Suspense>
      <FriendsView />
    </Suspense>
  );
}
