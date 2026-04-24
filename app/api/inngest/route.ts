import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { alexWorker } from "@/lib/inngest/alex-worker";
import { jeremyWorker } from "@/lib/inngest/jeremy-worker";
import { kaiWorker } from "@/lib/inngest/kai-worker";
import { danaWorker } from "@/lib/inngest/dana-worker";
import { marcusWorker } from "@/lib/inngest/marcus-worker";
import { mayaWorker } from "@/lib/inngest/maya-worker";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [alexWorker, jeremyWorker, kaiWorker, danaWorker, marcusWorker, mayaWorker],
});

// maxDuration caps the Vercel serverless invocation for each individual step,
// NOT the total Inngest function runtime. Inngest orchestrates durably across
// many invocations — total runtime is unbounded. 300s gives each step plenty
// of headroom for long Anthropic API calls. Requires Vercel Pro for >60s.
export const maxDuration = 300;
