import "../site-profile.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceTitle(html, value) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(value)}</title>`);
}

function replaceMeta(html, attribute, key, value) {
  const escaped = escapeHtml(value);
  const expression = new RegExp(
    `<meta\\s+([^>]*?${attribute}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*?)>`,
    "i",
  );
  return html.replace(expression, (tag, attributes) => {
    const nextAttributes = /\bcontent=["'][^"']*["']/i.test(attributes)
      ? attributes.replace(/\bcontent=["'][^"']*["']/i, `content="${escaped}"`)
      : `${attributes} content="${escaped}"`;
    return `<meta ${nextAttributes}>`;
  });
}

function neutralizeMetadata(html, metadata, neutralUrl) {
  let output = replaceTitle(html, metadata.title);
  output = replaceMeta(output, "name", "description", metadata.description);
  output = replaceMeta(output, "property", "og:site_name", metadata.siteName);
  output = replaceMeta(output, "property", "og:title", metadata.title);
  output = replaceMeta(output, "property", "og:description", metadata.description);
  output = replaceMeta(output, "property", "og:url", neutralUrl);
  output = replaceMeta(output, "property", "og:locale", metadata.locale);
  output = replaceMeta(output, "name", "twitter:title", metadata.title);
  output = replaceMeta(output, "name", "twitter:description", metadata.description);
  output = output.replace(/\s*<link\s+[^>]*rel=["']canonical["'][^>]*>/i, "");
  if (!/<meta\s+[^>]*name=["']robots["']/i.test(output)) {
    output = output.replace(
      /(<meta\s+name=["']viewport["'][^>]*>)/i,
      '$1\n    <meta name="robots" content="noindex, nofollow">',
    );
  }
  return output;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const profile = globalThis.assResolveSiteProfile?.(url.hostname, url.search);
  if (profile?.neutral && (url.pathname === "/" || url.pathname === "/index.html")) {
    const destination = new URL("/experiments/realism/planet-full", url);
    if (url.searchParams.get("site") === "neutral") {
      destination.searchParams.set("site", "neutral");
    }
    destination.searchParams.set("mode", "realism");
    destination.searchParams.set("quality", "high");
    destination.searchParams.set("view", "flight");
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination.href,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  const response = await context.next();
  if (!profile?.neutral) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const metadata = profile.metadata.ja;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.delete("content-length");
  const neutralHtml = neutralizeMetadata(html, metadata, profile.neutralUrl)
    .replace(/<html(\s+)/i, '<html data-site-profile="neutral"$1');
  return new Response(neutralHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
