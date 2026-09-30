export function checkRuntimeConfigScenarios({ loadConfigModule, expectEqual }) {
  const vercelConfig = loadConfigModule({
    env: {
      NEXT_PUBLIC_API_URL: 'https://thisgun4.gnuboard.net/gnuboard5/api/v1',
      NEXT_PUBLIC_G5_URL: 'https://thisgun4.gnuboard.net/gnuboard5',
      NEXT_PUBLIC_APP_URL: 'https://gnuboard5-nextjs-default.vercel.app',
    },
  });

  expectEqual(
    'Vercel g5BasePathForRuntime',
    vercelConfig.g5BasePathForRuntime(),
    ''
  );
  expectEqual(
    'Vercel g5PathForRuntime(/free/write)',
    vercelConfig.g5PathForRuntime('/free/write'),
    '/free/write'
  );
  expectEqual(
    'Vercel apiUrl(/captcha)',
    vercelConfig.apiUrl('/captcha?t=123'),
    'https://thisgun4.gnuboard.net/gnuboard5/api/v1/captcha?t=123'
  );
  expectEqual(
    'Vercel apiUrl(/captcha/audio)',
    vercelConfig.apiUrl('/captcha/audio?t=123'),
    'https://thisgun4.gnuboard.net/gnuboard5/api/v1/captcha/audio?t=123'
  );

  const serverInternalApiConfig = loadConfigModule({
    env: {
      NEXT_PUBLIC_API_URL: 'https://public.example.test/api/v1',
      G5_API_INTERNAL_URL: 'https://internal.example.test/api/v1',
      NEXT_PUBLIC_G5_URL: 'https://thisgun4.gnuboard.net/gnuboard5',
      NEXT_PUBLIC_APP_URL: 'https://gnuboard5-nextjs-default.vercel.app',
    },
  });

  expectEqual(
    'server apiBaseUrlForRuntime uses G5_API_INTERNAL_URL',
    serverInternalApiConfig.apiBaseUrlForRuntime(),
    'https://internal.example.test/api/v1'
  );
  expectEqual(
    'server apiUrl(/auth/me) uses G5_API_INTERNAL_URL',
    serverInternalApiConfig.apiUrl('/auth/me'),
    'https://internal.example.test/api/v1/auth/me'
  );

  const vercelBrowserConfig = loadConfigModule({
    env: {
      NEXT_PUBLIC_API_URL: 'https://thisgun4.gnuboard.net/gnuboard5/api/v1',
      NEXT_PUBLIC_G5_URL: 'https://thisgun4.gnuboard.net/gnuboard5',
      NEXT_PUBLIC_APP_URL: 'https://gnuboard5-nextjs-default.vercel.app',
    },
    windowValue: {
      location: {
        origin: 'https://gnuboard5-nextjs-default.vercel.app',
        hostname: 'gnuboard5-nextjs-default.vercel.app',
        pathname: '/gallery/%EC%8F%98%EB%A6%AC%EC%97%BC',
      },
      __G5_APP_CONFIG__: {
        apiBaseUrl: 'https://thisgun4.gnuboard.net/gnuboard5/api/v1',
        g5BaseUrl: 'https://thisgun4.gnuboard.net/gnuboard5',
        appBaseUrl: 'https://gnuboard5-nextjs-default.vercel.app',
      },
    },
  });

  expectEqual(
    'Vercel browser g5BasePathForRuntime',
    vercelBrowserConfig.g5BasePathForRuntime(),
    ''
  );
  expectEqual(
    'Vercel browser g5PathForRuntime(/gallery)',
    vercelBrowserConfig.g5PathForRuntime('/gallery'),
    '/gallery'
  );
  expectEqual(
    'Vercel browser apiBaseUrlForRuntime',
    vercelBrowserConfig.apiBaseUrlForRuntime(),
    '/api/v1'
  );
  expectEqual(
    'Vercel browser apiUrl(/settings)',
    vercelBrowserConfig.apiUrl('/settings'),
    '/api/v1/settings'
  );

  const browserConfigWithoutHostname = loadConfigModule({
    env: {
      NEXT_PUBLIC_API_URL: 'https://public.example.test/api/v1',
      NEXT_PUBLIC_G5_URL: 'https://public.example.test',
      NEXT_PUBLIC_APP_URL: 'https://app.example.test',
    },
    windowValue: {
      location: {
        origin: 'https://app.example.test',
        pathname: '/free',
      },
      __G5_APP_CONFIG__: {
        apiBaseUrl: 'https://runtime.example.test/api/v1',
        g5BaseUrl: 'https://runtime.example.test',
        appBaseUrl: 'https://app.example.test',
      },
    },
  });

  expectEqual(
    'browser config without hostname apiUrl(/settings)',
    browserConfigWithoutHostname.apiUrl('/settings'),
    'https://runtime.example.test/api/v1/settings'
  );

  const themeConfig = loadConfigModule({
    env: {
      NEXT_PUBLIC_API_URL: 'https://thisgun4.gnuboard.net/gnuboard5/api/v1',
      NEXT_PUBLIC_G5_URL: 'https://thisgun4.gnuboard.net/gnuboard5',
      NEXT_PUBLIC_APP_URL: 'https://gnuboard5-nextjs-default.vercel.app',
    },
    windowValue: {
      location: {
        origin: 'https://thisgun4.gnuboard.net',
        pathname: '/gnuboard5/free',
      },
      __G5_NEXTJS25_CONFIG__: {
        apiBaseUrl: 'https://thisgun4.gnuboard.net/gnuboard5/api/v1',
        g5BaseUrl: 'https://thisgun4.gnuboard.net/gnuboard5',
        appBaseUrl: 'https://thisgun4.gnuboard.net/gnuboard5',
      },
    },
  });

  expectEqual(
    'theme g5BasePathForRuntime',
    themeConfig.g5BasePathForRuntime(),
    '/gnuboard5'
  );
  expectEqual(
    'theme g5PathForRuntime(/free/write)',
    themeConfig.g5PathForRuntime('/free/write'),
    '/gnuboard5/free/write'
  );
  expectEqual(
    'theme apiUrl(/captcha)',
    themeConfig.apiUrl('/captcha?t=123'),
    '/gnuboard5/api/v1/captcha?t=123'
  );
  expectEqual(
    'theme apiUrl(/captcha/audio)',
    themeConfig.apiUrl('/captcha/audio?t=123'),
    '/gnuboard5/api/v1/captcha/audio?t=123'
  );

  const localPhpBridgeConfig = loadConfigModule({
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost/api/v1',
      NEXT_PUBLIC_G5_URL: 'http://localhost',
      NEXT_PUBLIC_APP_URL: 'http://localhost',
    },
    windowValue: {
      location: {
        origin: 'http://localhost',
        hostname: 'localhost',
        pathname: '/',
      },
      __G5_APP_CONFIG__: {
        apiBaseUrl: 'http://localhost/api/v1',
        g5BaseUrl: 'http://localhost',
        appBaseUrl: 'http://localhost',
      },
    },
  });

  expectEqual(
    'local PHP bridge apiUrl(/settings)',
    localPhpBridgeConfig.apiUrl('/settings'),
    '/api/v1/settings'
  );

  const customRuntimeKeyConfig = loadConfigModule({
    env: {
      NEXT_PUBLIC_RUNTIME_CONFIG_KEY: '__G5_CUSTOM_CONFIG__',
      NEXT_PUBLIC_API_URL: 'https://env.example/api/v1',
      NEXT_PUBLIC_G5_URL: 'https://env.example',
      NEXT_PUBLIC_APP_URL: 'https://env.example',
    },
    windowValue: {
      location: {
        origin: 'https://custom.example',
        pathname: '/free',
      },
      __G5_CUSTOM_CONFIG__: {
        apiBaseUrl: 'https://custom.example/api/v1',
        g5BaseUrl: 'https://custom.example',
        appBaseUrl: 'https://custom.example',
      },
    },
  });

  expectEqual(
    'custom runtime config key apiUrl(/boards)',
    customRuntimeKeyConfig.apiUrl('/boards'),
    '/api/v1/boards'
  );
}
