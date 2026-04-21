import { Client } from "ssh2";
import type { ConnectConfig } from "ssh2";

const PI_HOST = "192.168.68.92";
const PI_USER = "lineskippoc";
const TIMEOUT_MS = 30_000;

export async function runSSHCommand(command: string): Promise<string> {
  const password = process.env.SSH_PI_PASSWORD;
  const keyB64 = process.env.SSH_PI_KEY;

  if (!password && !keyB64) {
    throw new Error(
      "SSH credentials not configured. Add SSH_PI_PASSWORD or SSH_PI_KEY (base64 PEM) to .env.local"
    );
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH command timed out after 30 seconds"));
    }, TIMEOUT_MS);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          conn.end();
          const out = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")).trim();
          resolve(out || `Exit code: ${code}`);
        });

        stream.on("data", (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`SSH connection failed: ${err.message}. Is the Pi on the local network?`));
    });

    const config: ConnectConfig = {
      host: PI_HOST,
      port: 22,
      username: PI_USER,
      readyTimeout: 10_000,
    };

    if (keyB64) {
      config.privateKey = Buffer.from(keyB64, "base64").toString("utf-8");
    } else {
      config.password = password;
    }

    conn.connect(config);
  });
}
