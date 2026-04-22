import { Sandbox } from "@e2b/desktop";

export type Desktop = InstanceType<typeof Sandbox>;

export async function createDesktop(): Promise<{ desktop: Desktop; streamUrl: string }> {
  const desktop = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
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
      if (coordinate) await desktop.leftClick(coordinate[0], coordinate[1]);
      break;
    case "double_click":
      if (coordinate) await desktop.doubleClick(coordinate[0], coordinate[1]);
      break;
    case "right_click":
      if (coordinate) await desktop.rightClick(coordinate[0], coordinate[1]);
      break;
    case "middle_click":
      if (coordinate) await desktop.middleClick(coordinate[0], coordinate[1]);
      break;
    case "mouse_move":
      if (coordinate) await desktop.moveMouse(coordinate[0], coordinate[1]);
      break;
    case "left_click_drag":
      // Move to start position; full drag needs two coords — approximate with click
      if (coordinate) await desktop.leftClick(coordinate[0], coordinate[1]);
      break;
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
      break;
  }
}
