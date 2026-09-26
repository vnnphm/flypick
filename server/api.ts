/**
 * The app's small server API, mounted into Vite's dev and preview servers so one command runs
 * everything:
 *   POST /api/restaurants/scrape {id}  Firecrawl the allowlisted page for that id (server-side key)
 *   POST /api/runs <RunLog>            keep a live run log under runs/ (gitignored)
 */
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { saveCapture, scrapeMenu } from "./firecrawl.ts";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "../runs");

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function middleware(apiKey: string | undefined): Connect.NextHandleFunction {
  let inFlight = 0;
  return (req, res, next) => {
    const url = req.url?.split("?")[0];
    if (req.method !== "POST" || (url !== "/api/restaurants/scrape" && url !== "/api/runs")) return next();
    (async () => {
      if (url === "/api/restaurants/scrape") {
        const { id } = JSON.parse(await readBody(req, 1_000));
        if (typeof id !== "string") return send(res, 400, { error: "expected {id}" });
        if (inFlight >= 4) return send(res, 429, { error: "too many scrapes in flight" });
        inFlight++;
        try {
          const capture = await scrapeMenu(id, apiKey);
          await saveCapture(capture);
          send(res, 200, { capture });
        } finally {
          inFlight--;
        }
      } else {
        const log = JSON.parse(await readBody(req, 20_000_000));
        if (log?.format !== "flypick-run-v1" || typeof log.runId !== "string" || !/^[\w-]+$/.test(log.runId)) {
          return send(res, 400, { error: "not a run log" });
        }
        await mkdir(RUNS, { recursive: true });
        await writeFile(join(RUNS, `${log.runId}.json`), JSON.stringify(log));
        send(res, 200, { saved: `runs/${log.runId}.json` });
      }
    })().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      const status = /unknown restaurant/.test(message) ? 404 : 502;
      if (!res.headersSent) send(res, status, { error: message });
    });
  };
}

export function flypickApi(apiKey: string | undefined): Plugin {
  return {
    name: "flypick-api",
    configureServer(server) {
      server.middlewares.use(middleware(apiKey));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(apiKey));
    },
  };
}
