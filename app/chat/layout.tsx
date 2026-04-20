import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ChatLayoutClient from "@/components/chat/ChatLayoutClient";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ChatLayoutClient user={user}>{children}</ChatLayoutClient>;
}
