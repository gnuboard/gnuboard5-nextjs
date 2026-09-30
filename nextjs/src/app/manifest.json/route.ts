import manifest from "../manifest";

export const dynamic = "force-static";

export function GET() {
  return Response.json(manifest(), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
