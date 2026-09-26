/**
 * The app's small server API, mounted into Vite's dev and preview servers so one command runs
 * everything:
 *   GET  /api/places/cities?q=               city search (Nominatim)
 *   GET  /api/places/reverse?lat=&lon=       the city around a location (Nominatim)
 *   GET  /api/places/search?q=&lat=&lon=&bbox=  restaurants near a city (Photon)
 *   POST /api/menus/read {placeId}           find that place's menu and read it with Firecrawl
 *   POST /api/restaurants/scrape {id}        Firecrawl the allowlisted page for that id
 *   POST /api/runs <RunLog>                  keep a live run log under runs/ (gitignored)
 */
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { saveCapture, scrapeMenu } from "./firecrawl.ts";
import { readPlaceMenu } from "./menuFinder.ts";
import { reverseCity, searchCities, searchRestaurants } from "./places.ts";

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

const num = (v: string | null) => (v === null || v === "" ? NaN : Number(v));

function bboxParam(v: string | null): [number, number, number, number] | null {
  const b = v?.split(",").map(Number);
  return b && b.length === 4 && b.every(Number.isFinite) ? [b[0], b[1], b[2], b[3]] : null;
}

function middleware(apiKey: string | undefined): Connect.NextHandleFunction {
  let inFlight = 0;
  return (req, res, next) => {
    const full = new URL(req.url ?? "/", "http://local");
    const url = full.pathname;
    const q = full.searchParams;
    const route = `${req.method} ${url}`;
    const routes = ["GET /api/places/cities", "GET /api/places/reverse", "GET /api/places/search", "POST /api/menus/read",
      "POST /api/restaurants/scrape", "POST /api/runs"];
    if (!routes.includes(route)) return next();
    (async () => {
      if (route === "GET /api/places/cities") {
        send(res, 200, { cities: await searchCities(q.get("q") ?? "") });
      } else if (route === "GET /api/places/reverse") {
        send(res, 200, { city: await reverseCity(num(q.get("lat")), num(q.get("lon"))) });
      } else if (route === "GET /api/places/search") {
        const lat = num(q.get("lat")), lon = num(q.get("lon"));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return send(res, 400, { error: "choose a city first" });
        send(res, 200, { places: await searchRestaurants(q.get("q") ?? "", { lat, lon, bbox: bboxParam(q.get("bbox")) }) });
      } else if (route === "POST /api/menus/read") {
        const { placeId } = JSON.parse(await readBody(req, 1_000));
        if (typeof placeId !== "string") return send(res, 400, { error: "expected {placeId}" });
        if (inFlight >= 4) return send(res, 429, { error: "too many menus being read at once" });
        inFlight++;
        try {
          send(res, 200, await readPlaceMenu(placeId, apiKey));
        } finally {
          inFlight--;
        }
      } else if (route === "POST /api/restaurants/scrape") {
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
      const status = /unknown restaurant|not a place id|bad coordinates/.test(message) ? 400 : 502;
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
