# gnuboard5-nextjs 설치 안내

이 패키지는 Gnuboard5/YoungCart5 위에 얹는 add-on overlay입니다.
단독 애플리케이션이 아니며, 원본 Gnuboard 코어 파일을 수정하지 않는 방식으로
배포됩니다.

GitHub에서 설치할 때는 자동 생성되는 `Source code.zip`이 아니라 Releases에
첨부된 파일을 받아야 합니다.

```text
gnuboard5-nextjs-vX.Y.Z.zip
```

## 설치 순서

1. 기존 Gnuboard 파일과 DB를 백업합니다.
2. release zip을 Gnuboard 루트에 압축 해제합니다.
3. 관리자 화면에서 `/adm/dbupgrade.php`를 실행합니다.
4. 필요한 경우 `nextjs-install/tables.sql`을 수동 실행합니다.
   테이블 prefix가 `g5_`가 아니면 SQL 안의 prefix를 먼저 바꿔주세요.
5. 관리자 > 환경설정 > 테마설정에서 `Next.js Default`(nextjs_default) 테마를 선택합니다.
6. Apache 사용자는 `nextjs-install/apache-htaccess-rules.txt` 내용을
   루트 `.htaccess`의 기존 Gnuboard 짧은주소 rewrite 규칙보다 앞에 추가합니다.
7. nginx 사용자는 `nextjs-install/nginx/`의 snippet을 서버 설정에 맞게 반영합니다.
8. 다음 경로가 정상인지 확인합니다.

```text
/
/boards
/shop
/login
/api/v1/settings
```

설치 후 `최고관리자`로 로그인한 상태에서 `/nextjs-install/check.php`를 열면
필수 파일, 활성 테마, runtime 테이블, Apache rewrite/캐시 파일 상태를 한 번에
점검할 수 있습니다. 배포가 끝나면 외부 노출을 줄이기 위해 이 파일을 삭제해도 됩니다.

## 포함 파일

Release zip은 Gnuboard 루트에 바로 덮어쓸 수 있는 구조입니다.

```text
api/
plugin/webapp/          정문 route.php · 연장통 · 부팅 · 소셜 다리 · 표 등록 · 알림 · 크론
theme/nextjs_default/
extend/webapp.extend.php   그누보드가 매 요청 자동 실행하는 유일한 훅(plugin/webapp 로더)
nextjs-install/
INSTALL.md
LICENSE
LICENSE.gnuboard.txt
MANIFEST.json
```

## 주의 사항

- 최소 확인 버전은 Gnuboard5 `5.6.26` 기준입니다.
- `api/cert`는 Gnuboard의 `plugin/inicert`, `plugin/kcpcert`를 사용합니다.
- `api/social`은 Gnuboard의 `plugin/social` 설정을 사용합니다.
- API와 프론트가 서로 다른 도메인에서 동작한다면 `extend/`에서
  `G5_CORS_ALLOWED_ORIGINS`를 쉼표로 구분해 직접 정의하세요.
- `.htaccess`는 사이트 전체에 영향을 줄 수 있으므로 자동 수정하지 않습니다.
  제공된 rewrite 규칙을 확인한 뒤 수동 반영하는 방식을 권장합니다.
- Apache에서 정적 자산 캐시/압축을 사용하려면 `mod_headers`, `mod_mime`,
  `mod_deflate`를 활성화하고 `theme/nextjs_default/app` 경로에 `.htaccess`
  `FileInfo` override가 허용되어야 합니다.
- nginx에서는 `nextjs-install/nginx/nextjs_default-theme-locations.conf`의
  `/_next/static/` 및 `/theme/nextjs_default/app/_next/static/` 캐시 규칙을
  반영하세요.

## 배포자용 메모

개발자는 GitHub Release asset만 사용자에게 안내해야 합니다. GitHub의
`Source code.zip`은 개발 저장소 구조라 설치용 패키지가 아닙니다.
