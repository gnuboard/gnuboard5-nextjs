import sanitizeHtmlLibrary from "sanitize-html";

const allowedTags = Array.from(
  new Set([
    ...sanitizeHtmlLibrary.defaults.allowedTags,
    "article",
    "aside",
    "figure",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "img",
    "mark",
    "picture",
    "source",
    "span",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
  ])
);

const contentAllowedAttributes: sanitizeHtmlLibrary.IOptions["allowedAttributes"] = {
  ...sanitizeHtmlLibrary.defaults.allowedAttributes,
  "*": ["class", "title", "aria-label"],
  a: ["href", "name", "target", "rel"],
  img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
  source: ["src", "srcset", "type", "media"],
  table: ["summary"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "scope", "headers"],
};

const userAllowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "u",
  "ul",
];

const userAllowedAttributes: sanitizeHtmlLibrary.IOptions["allowedAttributes"] = {
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "title", "width", "height", "loading"],
  "*": ["title", "aria-label"],
};

const inlineAllowedTags = ["a", "b", "br", "code", "em", "i", "mark", "s", "span", "strong", "u"];

const droppedHtmlImageHosts = new Set([
  "demo.sir.co.kr",
  "demo.sir.kr",
  "www.hancomlifecare.com",
]);

function shouldDropHtmlImage(src: string | undefined): boolean {
  if (!src) return false;

  try {
    const url = new URL(src, "http://local.invalid");
    return droppedHtmlImageHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function labelForHref(href: string): string {
  try {
    const url = new URL(href, "http://local.invalid");
    if (url.hostname && url.hostname !== "local.invalid") {
      return `Link: ${url.hostname}`;
    }
  } catch {
    // Fall back to the raw href below.
  }

  return `Link: ${href}`;
}

function getAttributeValue(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );

  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function addImageOnlyLinkLabels(html: string): string {
  return html.replace(
    /<a\b([^>]*)>(\s*<img\b[^>]*>\s*)<\/a>/gi,
    (match, attributes: string, imageHtml: string) => {
      if (/\baria-label\s*=/i.test(attributes)) {
        return match;
      }

      const href = getAttributeValue(attributes, "href");
      if (!href) {
        return match;
      }

      const imageAlt = getAttributeValue(imageHtml, "alt")?.trim();
      const label = imageAlt || labelForHref(href);

      return `<a${attributes} aria-label="${escapeAttribute(label)}">${imageHtml}</a>`;
    }
  );
}

function sanitizeRichHtml(
  html: string | null | undefined,
  options: {
    allowedTags: string[];
    allowedAttributes: sanitizeHtmlLibrary.IOptions["allowedAttributes"];
  }
): string {
  return addImageOnlyLinkLabels(sanitizeHtmlLibrary(html ?? "", {
    allowedTags: options.allowedTags,
    allowedAttributes: options.allowedAttributes,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    exclusiveFilter: (frame) =>
      frame.tag === "img" && shouldDropHtmlImage(frame.attribs?.src),
    transformTags: {
      a: (tagName, attribs) => {
        if (!attribs.href || attribs.href.startsWith("#")) {
          return { tagName, attribs };
        }

        return {
          tagName,
          attribs: {
            ...attribs,
            rel: "noopener noreferrer",
            target: attribs.target || "_blank",
          },
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          loading: attribs.loading || "lazy",
        },
      }),
    },
  }));
}

export function sanitizeContentHtml(html: string | null | undefined): string {
  return sanitizeRichHtml(html, {
    allowedTags,
    allowedAttributes: contentAllowedAttributes,
  });
}

export function sanitizeCommerceHtml(html: string | null | undefined): string {
  return sanitizeContentHtml(html);
}

export function sanitizeUserHtml(html: string | null | undefined): string {
  return sanitizeRichHtml(html, {
    allowedTags: userAllowedTags,
    allowedAttributes: userAllowedAttributes,
  });
}

export function sanitizeInlineHtml(html: string | null | undefined): string {
  return sanitizeRichHtml(html, {
    allowedTags: inlineAllowedTags,
    allowedAttributes: userAllowedAttributes,
  });
}

export function sanitizeHtml(html: string | null | undefined): string {
  return sanitizeContentHtml(html);
}

export function htmlToPlainText(html: string | null | undefined): string {
  return sanitizeHtmlLibrary(html ?? "", {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}
