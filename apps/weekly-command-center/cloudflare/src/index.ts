/**
 * Worker entrypoint for the Cloudflare Containers deployment. Routes
 * `/api/*` to the single app container (core-api + its Julia/Haskell
 * sidecars — see ../Dockerfile), and serves the static frontend for
 * everything else via the Workers assets binding.
 *
 * Written to the best of available Cloudflare Containers documentation;
 * not deployed or `wrangler`-validated in the sandbox this was authored in
 * (no Cloudflare account/CLI access there). Confirm the `@cloudflare/containers`
 * API below still matches current docs before deploying — this product
 * surface was still evolving as of this writing.
 */
import { Container, getContainer } from "@cloudflare/containers";

export class WccAppContainer extends Container {
  defaultPort = 8000;
  // Keep the container warm for a while after the last request rather than
  // cold-starting on every request — tune to your actual traffic pattern.
  sleepAfter = "10m";
}

export interface Env {
  WCC_CONTAINER: DurableObjectNamespace<WccAppContainer>;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      const container = getContainer(env.WCC_CONTAINER, "singleton");
      const upstreamUrl = new URL(request.url);
      upstreamUrl.pathname = url.pathname.replace(/^\/api/, "") || "/";
      return container.fetch(new Request(upstreamUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
