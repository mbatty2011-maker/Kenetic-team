import { AGENTS, type AgentKey } from "@/lib/agents";
import { notFound } from "next/navigation";
import ChatWindow from "@/components/chat/ChatWindow";
import AlexChatWindow from "@/components/chat/AlexChatWindow";

export default function AgentChatPage({
  params,
}: {
  params: { agent: string };
}) {
  const agent = AGENTS.find((a) => a.key === params.agent);
  const isBoardroom = params.agent === "boardroom";

  if (!agent && !isBoardroom) notFound();

  if (params.agent === "alex") {
    return <AlexChatWindow />;
  }

  return <ChatWindow agentKey={params.agent as AgentKey | "boardroom"} />;
}
