import {
  configuredThemePairs,
  resolveThemePair,
  sourceForTheme,
  themeForSource,
} from './theme-pair.mjs';

function withThemeEnv(env, callback) {
  const previousSource = process.env.G5_THEME_SOURCE;
  const previousTheme = process.env.G5_THEME_NAME;

  if (Object.hasOwn(env, 'G5_THEME_SOURCE')) {
    process.env.G5_THEME_SOURCE = env.G5_THEME_SOURCE;
  } else {
    delete process.env.G5_THEME_SOURCE;
  }

  if (Object.hasOwn(env, 'G5_THEME_NAME')) {
    process.env.G5_THEME_NAME = env.G5_THEME_NAME;
  } else {
    delete process.env.G5_THEME_NAME;
  }

  try {
    return callback();
  } finally {
    if (previousSource === undefined) {
      delete process.env.G5_THEME_SOURCE;
    } else {
      process.env.G5_THEME_SOURCE = previousSource;
    }

    if (previousTheme === undefined) {
      delete process.env.G5_THEME_NAME;
    } else {
      process.env.G5_THEME_NAME = previousTheme;
    }
  }
}

// 테마 이름은 매니페스트에서 읽는다 — 이 파일에 비공개 테마 이름을 적지 않는다(공개 배포판은 공개 테마만 싣는다).
const pairs = configuredThemePairs();
// default 가 아닌 짝이 있으면 그것을 "다른 환경 값"으로 쓴다. 공개판처럼 하나뿐이면 default 로 대신한다.
const other = pairs.find((pair) => pair.source !== 'default') ?? { source: 'default', theme: 'nextjs_default' };

const checks = [
  {
    name: 'no-arg resolve uses default (default -> nextjs_default) when ambient env is empty',
    actual: withThemeEnv({ G5_THEME_SOURCE: '', G5_THEME_NAME: '' }, () => resolveThemePair()),
    expected: { source: 'default', theme: 'nextjs_default' },
  },
  {
    name: 'no-arg resolve follows ambient source env',
    actual: withThemeEnv({ G5_THEME_SOURCE: other.source, G5_THEME_NAME: '' }, () => resolveThemePair()),
    expected: { source: other.source, theme: other.theme },
  },
  ...pairs.flatMap((pair) => [
    {
      name: `theme ${pair.theme} maps to source ${pair.source}`,
      actual: sourceForTheme(pair.theme),
      expected: pair.source,
    },
    {
      name: `source ${pair.source} maps to theme ${pair.theme}`,
      actual: themeForSource(pair.source),
      expected: pair.theme,
    },
  ]),
  {
    name: 'explicit theme ignores ambient source env',
    actual: withThemeEnv({ G5_THEME_SOURCE: other.source, G5_THEME_NAME: '' }, () => resolveThemePair({ theme: 'nextjs_default' })),
    expected: { source: 'default', theme: 'nextjs_default' },
  },
  {
    name: 'explicit source ignores ambient theme env',
    actual: withThemeEnv({ G5_THEME_SOURCE: '', G5_THEME_NAME: other.theme }, () => resolveThemePair({ source: 'default' })),
    expected: { source: 'default', theme: 'nextjs_default' },
  },
  {
    name: 'explicit source and theme are preserved',
    actual: resolveThemePair({ source: 'default', theme: 'customtheme' }),
    expected: { source: 'default', theme: 'customtheme' },
  },
  {
    name: 'configured pairs include default->nextjs_default',
    actual: pairs.some((pair) => pair.source === 'default' && pair.theme === 'nextjs_default'),
    expected: true,
  },
];

function sameValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const rows = checks.map((check) => ({
  check: check.name,
  status: sameValue(check.actual, check.expected) ? 'ok' : 'fail',
  actual: JSON.stringify(check.actual),
  expected: JSON.stringify(check.expected),
}));

console.table(rows);

const failed = rows.filter((row) => row.status === 'fail');
if (failed.length > 0) {
  console.error(`[check-theme-pair] ${failed.length} theme pair check(s) failed`);
  process.exit(1);
}

console.log('[check-theme-pair] theme pair checks passed');
