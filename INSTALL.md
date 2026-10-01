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
2. release zip을 Gnuboard 루트(`common.php`가 있는 폴더)에 압축 해제합니다.
3. `/api/v1/status`를 열어 `database.ok`와 `schema.ok`가 `true`인지 확인합니다.
   필요한 테이블은 API가 처음 호출될 때 스스로 만듭니다. `schema.ok`가 `false`면
   최고관리자로 `/adm/dbupgrade.php`를 실행하고, 그래도 안 되면
   `nextjs-install/tables.sql`을 수동 실행합니다(테이블 prefix가 `g5_`가 아니면
   SQL 안의 prefix를 먼저 바꿔주세요).
4. 관리자 > 환경설정 > 테마설정에서 `Next.js Default`(nextjs_default) 테마를 적용합니다.
5. 웹서버 규칙
   - Apache/LiteSpeed: 테마를 적용하는 순간 루트 `.htaccess`의 Gnuboard rewrite 블록이
     새 테마에 맞게 자동으로 바뀝니다(블록 밖의 줄은 그대로). `.htaccess`를 쓸 수
     없다는 알림이 뜨면 관리자 > 환경설정 > 기본환경설정 > 짧은 주소 설정의
     "Apache 설정 코드"를 직접 넣으세요.
   - nginx: 테마를 적용한 **뒤** 짧은 주소 설정의 "Nginx 설정 코드"를 서버 설정에
     넣고 nginx를 다시 불러옵니다.
6. 다음 경로가 정상인지 확인합니다.

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
- API와 프론트가 서로 다른 도메인에서 동작한다면(예: Vercel) `api/.env`에
  `G5_CORS_ALLOWED_ORIGINS`와 `G5_SOCIAL_WEB_HOSTS`를 적으세요.
  `api/env.example`은 모든 값이 주석으로 된 예시이니 필요한 줄만 골라 쓰세요.
- 새 화면은 설치 직후 검색엔진에 노출되지 않습니다. 공개할 때 `api/.env`에
  `G5_NEXTJS_SEO=on`(필요하면 `G5_NEXTJS_SEO_SITEMAP=on`)을 적으세요.
- `nextjs-install/apache-htaccess-rules.txt`는 테마 적용 때 들어가는 rewrite 규칙의
  참고본입니다. 자동 반영이 되는 환경에서는 따로 넣을 필요가 없습니다.
- Apache에서 정적 자산 캐시/압축을 사용하려면 `mod_headers`, `mod_mime`,
  `mod_deflate`를 활성화하고 `theme/nextjs_default/app` 경로에 `.htaccess`
  `FileInfo` override가 허용되어야 합니다.
- nginx에서는 `/_next/static/`을 `alias`나 `try_files`로 테마 폴더에서 직접
  내보내지 마세요. 브리지를 거쳐야 설치 폴더에 맞는 주소로 바뀝니다.
  `nextjs-install/nginx/`의 파일은 보안 헤더 · 요청 수 제한 같은 추가 설정의
  참고본입니다.

## 배포자용 메모

개발자는 GitHub Release asset만 사용자에게 안내해야 합니다. GitHub의
`Source code.zip`은 개발 저장소 구조라 설치용 패키지가 아닙니다.
