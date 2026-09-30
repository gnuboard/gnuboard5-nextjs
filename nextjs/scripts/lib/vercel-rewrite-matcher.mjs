const compiledSources = new Map();

function escapeRegexCharacter(character) {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function readCustomPattern(source, openIndex) {
  let depth = 1;
  let escaped = false;
  let inCharacterClass = false;

  for (let index = openIndex + 1; index < source.length; index += 1) {
    const character = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '[' && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (inCharacterClass) continue;

    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character !== ')') continue;

    depth -= 1;
    if (depth === 0) {
      return {
        endIndex: index + 1,
        pattern: source.slice(openIndex + 1, index),
      };
    }
  }

  throw new Error(`Unclosed custom parameter pattern in Vercel rewrite source: ${source}`);
}

export function compileVercelRewriteSource(source) {
  const cached = compiledSources.get(source);
  if (cached) return cached;

  let expression = '';
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character !== ':') {
      expression += escapeRegexCharacter(character);
      index += 1;
      continue;
    }

    const nameMatch = source.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!nameMatch) {
      expression += ':';
      index += 1;
      continue;
    }

    const name = nameMatch[0];
    index += name.length + 1;
    let pattern = '[^/]+';
    if (source[index] === '(') {
      const customPattern = readCustomPattern(source, index);
      pattern = customPattern.pattern;
      index = customPattern.endIndex;
    }
    expression += `(?<${name}>${pattern})`;
  }

  const compiled = new RegExp(`^${expression}$`);
  compiledSources.set(source, compiled);
  return compiled;
}

export function rewriteVercelPathname(pathname, rewrites) {
  const normalizedPathname = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');

  for (const rewrite of rewrites) {
    const match = compileVercelRewriteSource(rewrite.source).exec(normalizedPathname);
    if (!match) continue;

    return rewrite.destination.replace(
      /:([A-Za-z_][A-Za-z0-9_]*)/g,
      (_token, name) => match.groups?.[name] ?? ''
    );
  }

  return null;
}
