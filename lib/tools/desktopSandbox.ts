import { Sandbox } from "@e2b/desktop";

export type Desktop = InstanceType<typeof Sandbox>;

const DISPLAY_W = 1024;
const DISPLAY_H = 768;

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

export async function createDesktop(): Promise<{ desktop: Desktop; streamUrl: string }> {
  if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is not configured");
  const desktop = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: 290_000,
  });
  await desktop.stream.start();
  const streamUrl = desktop.stream.getUrl({ autoConnect: true, viewOnly: true, resize: "scale" });
  return { desktop, streamUrl };
}

export async function takeScreenshot(desktop: Desktop): Promise<string> {
  const bytes = await desktop.screenshot();
  return Buffer.from(bytes).toString("base64");
}

export async function executeComputerAction(
  desktop: Desktop,
  action: string,
  coordinate?: [number, number],
  text?: string,
  scrollDirection?: string,
  scrollAmount?: number
): Promise<void> {
  switch (action) {
    case "left_click":
      if (coordinate) await desktop.leftClick(clamp(coordinate[0], DISPLAY_W), clamp(coordinate[1], DISPLAY_H));
      break;
    case "double_click":
      if (coordinate) await desktop.doubleClick(clamp(coordinate[0], DISPLAY_W), clamp(coordinate[1], DISPLAY_H));
      break;
    case "right_click":
      if (coordinate) await desktop.rightClick(clamp(coordinate[0], DISPLAY_W), clamp(coordinate[1], DISPLAY_H));
      break;
    case "middle_click":
      if (coordinate) await desktop.middleClick(clamp(coordinate[0], DISPLAY_W), clamp(coordinate[1], DISPLAY_H));
      break;
    case "mouse_move":
      if (coordinate) await desktop.moveMouse(clamp(coordinate[0], DISPLAY_W), clamp(coordinate[1], DISPLAY_H));
      break;
    case "left_click_drag":
      throw new Error("left_click_drag is not supported — use click or scroll instead");
    case "type":
      if (text) await desktop.write(text);
      break;
    case "key":
      if (text) await desktop.press(text);
      break;
    case "scroll": {
      const dir = (scrollDirection === "up" ? "up" : "down") as "up" | "down";
      await desktop.scroll(dir, scrollAmount ?? 3);
      break;
    }
    case "screenshot":
      break; // handled by caller
    default:
      throw new Error(`Unknown computer action: ${action}`);
  }
}
