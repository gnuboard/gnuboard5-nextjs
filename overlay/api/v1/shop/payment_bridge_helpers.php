<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function pg_bridge_json($value): string {
    $json = json_encode(
        $value,
        JSON_UNESCAPED_SLASHES
            | JSON_UNESCAPED_UNICODE
            | JSON_HEX_TAG
            | JSON_HEX_AMP
            | JSON_HEX_APOS
            | JSON_HEX_QUOT
            // PG 가 보낸 깨진 UTF-8 한 글자 때문에 결과 전체가 null 이 되어 앱이 결제창에 갇히지 않게 한다.
            | JSON_INVALID_UTF8_SUBSTITUTE
    );

    return $json === false ? 'null' : $json;
}

function pg_mobile_request_value(array $input, array $keys, string $default = ''): string {
    foreach ($keys as $key) {
        if (isset($input[$key]) && trim((string) $input[$key]) !== '') {
            return trim((string) $input[$key]);
        }
    }
    return $default;
}

function pg_mobile_return_html(string $targetUrl, string $title, string $message): void {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ko"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>';
    echo '<style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.card{max-width:420px;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:20px}h1{font-size:20px;margin:0 0 8px}p{color:#64748b;font-size:14px;line-height:1.5}a{display:block;border-radius:8px;background:#0f172a;color:#fff;text-align:center;text-decoration:none;font-weight:800;padding:14px 16px}</style>';
    echo '</head><body><div class="wrap"><div class="card">';
    echo '<h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>';
    echo '<p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';
    echo '<a href="' . htmlspecialchars($targetUrl, ENT_QUOTES, 'UTF-8') . '">&#49660;&#54609;&#47792; &#50545;&#51004;&#47196; &#46028;&#50500;&#44032;&#44592;</a>';
    echo '</div></div><script>setTimeout(function(){ location.href = ' . pg_bridge_json($targetUrl) . '; }, 350);</script></body></html>';
    exit;
}

function pg_post_message_origin(string $origin): string {
    $origin = trim($origin);
    if ($origin === '') {
        return '*';
    }

    $parts = parse_url($origin);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
        return '*';
    }

    $scheme = strtolower((string) $parts['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) {
        return '*';
    }

    $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
    return $scheme . '://' . $parts['host'] . $port;
}

function pg_bridge_script_tag(string $body): string {
    return '<script>' . $body . '</script>';
}

function pg_bridge_script_from_template(string $template, array $tokens): string {
    return strtr(trim($template), $tokens);
}

function pg_kcp_bridge_script(string $payloadJson, string $targetJson): string {
    return pg_bridge_script_from_template(<<<'JS'
(function(){
  var payload=__PAYLOAD__;
  var target=__TARGET__;

  function bridgeDebug(message,error){
    if(window.console&&typeof window.console.debug==="function"){
      window.console.debug("[g5-payment-bridge] "+message,error);
    }
  }

  function appOrigin(){
    return target&&target!=="*"?target:window.location.origin;
  }

  function show(message){
    var node=document.querySelector(".card p");
    if(node){
      node.textContent=message;
    }else{
      document.body.textContent=message;
    }
  }

  function sendApp(message){
    try{
      // Android RN WebView 는 YoungcartApp shim 을 페이지 시작 뒤 비동기로 넣어 이 인라인 스크립트보다 늦을 수 있다.
      // 그때는 처음부터 있는 네이티브 인터페이스 ReactNativeWebView 로 같은 메시지를 보낸다.
      if(window.YoungcartApp&&typeof window.YoungcartApp.postMessage==="function"){
        window.YoungcartApp.postMessage(message);
        return true;
      }else if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==="function"){
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        return true;
      }
    }catch(error){
      bridgeDebug("YoungcartApp postMessage failed",error);
    }
    return false;
  }

  function handleTopReturn(){
    if(window.top!==window||window.opener){
      return false;
    }

    var origin=appOrigin();
    if(payload.type==="shop-kcp-auth-result"&&payload.status==="success"){
      var fields=payload.fields||{};
      var headers={"Content-Type":"application/json"};
      var body=Object.assign({
        pg_service:"kcp",
        order_id:payload.orderId||fields.ordr_idxx||"",
        amount:payload.amount||Number(fields.good_mny||0)
      },fields);

      fetch("/api/v1/shop/payment/confirm",{
        method:"POST",
        headers:headers,
        credentials:"include",
        body:JSON.stringify(body)
      }).then(function(res){
        return res.json().catch(function(){return {};}).then(function(json){
          return {ok:res.ok,body:json};
        });
      }).then(function(result){
        if(result.ok&&result.body&&result.body.success!==false){
          var id=result.body.data&&result.body.data.order_id?result.body.data.order_id:(payload.orderId||fields.ordr_idxx||"");
          var uid=result.body.data&&result.body.data.uid?result.body.data.uid:"";
          location.replace(origin+"/shop/orders/"+encodeURIComponent(id)+(uid?"?uid="+encodeURIComponent(uid):""));
          return;
        }
        var msg=result.body&&(result.body.message||(result.body.error&&result.body.error.message))||"KCP payment confirmation failed.";
        show(msg);
      }).catch(function(error){
        show(error&&error.message?error.message:"KCP payment confirmation failed.");
      });
      return true;
    }

    if(payload.type==="shop-payment-result"){
      show(payload.message||"KCP payment was not completed.");
      return true;
    }
    return false;
  }

  if(sendApp(payload)){
    return;
  }
  if(handleTopReturn()){
    return;
  }

  try{
    if(window.parent&&window.parent!==window){
      window.parent.postMessage(payload,target);
    }
  }catch(error){
    bridgeDebug("parent postMessage failed",error);
  }
  try{
    if(window.top&&window.top!==window&&window.top!==window.parent){
      window.top.postMessage(payload,target);
    }
  }catch(error){
    bridgeDebug("top postMessage failed",error);
  }
  try{
    if(window.opener&&!window.opener.closed){
      window.opener.postMessage(payload,target);
      window.close();
    }
  }catch(error){
    bridgeDebug("opener postMessage or window close failed",error);
  }
}());
JS, [
        '__PAYLOAD__' => $payloadJson,
        '__TARGET__' => $targetJson,
    ]);
}

function pg_inicis_bridge_script(string $payloadJson, string $targetJson, string $confirmUrlJson, string $confirmPgServiceJson): string {
    return pg_bridge_script_from_template(<<<'JS'
(function(){
  var payload=__PAYLOAD__;
  var target=__TARGET__;
  var confirmUrl=__CONFIRM_URL__;
  var confirmPgService=__CONFIRM_PG_SERVICE__;

  function bridgeDebug(message,error){
    if(window.console&&typeof window.console.debug==="function"){
      window.console.debug("[g5-payment-bridge] "+message,error);
    }
  }

  function appOrigin(){
    return target&&target!=="*"?target:window.location.origin;
  }

  function show(message){
    var node=document.querySelector(".card p");
    if(node){
      node.textContent=message;
    }else{
      document.body.textContent=message;
    }
  }

  function post(message){
    var delivered=false;
    try{
      // Android RN WebView 는 YoungcartApp shim 을 페이지 시작 뒤 비동기로 넣어 이 인라인 스크립트보다 늦을 수 있다.
      // 그때는 처음부터 있는 네이티브 인터페이스 ReactNativeWebView 로 같은 메시지를 보낸다.
      if(window.YoungcartApp&&typeof window.YoungcartApp.postMessage==="function"){
        window.YoungcartApp.postMessage(message);
        delivered=true;
      }else if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==="function"){
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        delivered=true;
      }
    }catch(error){
      bridgeDebug("YoungcartApp postMessage failed",error);
    }
    try{
      if(window.parent&&window.parent!==window){
        window.parent.postMessage(message,target);
        delivered=true;
      }
    }catch(error){
      bridgeDebug("parent postMessage failed",error);
    }
    try{
      if(window.top&&window.top!==window&&window.top!==window.parent){
        window.top.postMessage(message,target);
        delivered=true;
      }
    }catch(error){
      bridgeDebug("top postMessage failed",error);
    }
    try{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage(message,target);
        delivered=true;
      }
    }catch(error){
      bridgeDebug("opener postMessage failed",error);
    }
    return delivered;
  }

  function hasNativeApp(){
    // RN WebView 는 YoungcartApp shim 이 늦게 들어올 수 있어 ReactNativeWebView 도 앱으로 본다(post 와 같은 기준).
    return !!((window.YoungcartApp&&typeof window.YoungcartApp.postMessage==="function")
      ||(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==="function"));
  }

  function hasHost(){
    return !!((window.parent&&window.parent!==window)||(window.top&&window.top!==window)||(window.opener&&!window.opener.closed));
  }

  function closeLater(){
    setTimeout(function(){
      try{
        window.close();
      }catch(error){
        bridgeDebug("window close failed",error);
      }
    },500);
  }

  if(payload.type==="shop-inicis-auth-result"&&payload.status==="success"){
    if(hasNativeApp()){
      post(payload);
      closeLater();
      return;
    }
    if(hasHost()){
      post(payload);
      closeLater();
      return;
    }

    var fields=payload.fields||{};
    var headers={"Content-Type":"application/json"};
    var body=Object.assign({
      pg_service:confirmPgService,
      order_id:payload.orderId||fields.MOID||fields.Moid||fields.orderNumber||"",
      amount:payload.amount||Number(fields.TotPrice||fields.price||0)
    },fields);

    fetch(confirmUrl,{
      method:"POST",
      headers:headers,
      credentials:"include",
      body:JSON.stringify(body)
    }).then(function(res){
      return res.json().catch(function(){return {};}).then(function(json){
        return {ok:res.ok,body:json};
      });
    }).then(function(result){
      if(result.ok&&result.body&&result.body.success!==false){
        var id=result.body.data&&result.body.data.order_id?result.body.data.order_id:(payload.orderId||fields.MOID||fields.orderNumber||"");
        var uid=result.body.data&&result.body.data.uid?result.body.data.uid:"";
        location.replace(appOrigin()+"/shop/orders/"+encodeURIComponent(id)+(uid?"?uid="+encodeURIComponent(uid):""));
        return;
      }
      var msg=result.body&&(result.body.message||(result.body.error&&result.body.error.message))||"KG Inicis payment confirmation failed.";
      show(msg);
      post({type:"shop-payment-result",status:"error",message:msg});
    }).catch(function(error){
      var msg=error&&error.message?error.message:"KG Inicis payment confirmation failed.";
      show(msg);
      post({type:"shop-payment-result",status:"error",message:msg});
    });
    return;
  }

  var status=payload.status==="cancelled"?"cancelled":"error";
  var msg=payload.message||"KG Inicis payment was not completed.";
  show(msg);
  post({type:"shop-payment-result",status:status,message:msg});
  closeLater();
}());
JS, [
        '__PAYLOAD__' => $payloadJson,
        '__TARGET__' => $targetJson,
        '__CONFIRM_URL__' => $confirmUrlJson,
        '__CONFIRM_PG_SERVICE__' => $confirmPgServiceJson,
    ]);
}

function pg_nicepay_bridge_script(string $payloadJson, string $targetJson, string $confirmUrlJson): string {
    return pg_bridge_script_from_template(<<<'JS'
(function(){
  var payload=__PAYLOAD__;
  var target=__TARGET__;
  var confirmUrl=__CONFIRM_URL__;

  function bridgeDebug(message,error){
    if(window.console&&typeof window.console.debug==="function"){
      window.console.debug("[g5-payment-bridge] "+message,error);
    }
  }

  function appOrigin(){
    return target&&target!=="*"?target:window.location.origin;
  }

  function show(message){
    var node=document.querySelector(".card p");
    if(node){
      node.textContent=message;
    }else{
      document.body.textContent=message;
    }
  }

  function post(message){
    var delivered=false;
    try{
      // Android RN WebView 는 YoungcartApp shim 을 페이지 시작 뒤 비동기로 넣어 이 인라인 스크립트보다 늦을 수 있다.
      // 그때는 처음부터 있는 네이티브 인터페이스 ReactNativeWebView 로 같은 메시지를 보낸다.
      if(window.YoungcartApp&&typeof window.YoungcartApp.postMessage==="function"){
        window.YoungcartApp.postMessage(message);
        delivered=true;
      }else if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==="function"){
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        delivered=true;
      }
    }catch(error){
      bridgeDebug("YoungcartApp postMessage failed",error);
    }
    try{
      if(window.parent&&window.parent!==window){
        window.parent.postMessage(message,target);
        delivered=true;
      }
    }catch(error){
      bridgeDebug("parent postMessage failed",error);
    }
    try{
      if(window.top&&window.top!==window&&window.top!==window.parent){
        window.top.postMessage(message,target);
        delivered=true;
      }
    }catch(error){
      bridgeDebug("top postMessage failed",error);
    }
    try{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage(message,target);
        delivered=true;
      }
    }catch(error){
      bridgeDebug("opener postMessage failed",error);
    }
    return delivered;
  }

  function hasNativeApp(){
    // RN WebView 는 YoungcartApp shim 이 늦게 들어올 수 있어 ReactNativeWebView 도 앱으로 본다(post 와 같은 기준).
    return !!((window.YoungcartApp&&typeof window.YoungcartApp.postMessage==="function")
      ||(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==="function"));
  }

  function hasHost(){
    return !!((window.parent&&window.parent!==window)||(window.top&&window.top!==window)||(window.opener&&!window.opener.closed));
  }

  function closeLater(){
    setTimeout(function(){
      try{
        window.close();
      }catch(error){
        bridgeDebug("window close failed",error);
      }
    },500);
  }

  if(payload.type==="shop-nicepay-auth-result"&&payload.status==="success"){
    if(hasNativeApp()){
      post(payload);
      closeLater();
      return;
    }
    if(hasHost()){
      post(payload);
      closeLater();
      return;
    }

    var fields=payload.fields||{};
    var headers={"Content-Type":"application/json"};
    var body=Object.assign({
      pg_service:"nicepay",
      order_id:payload.orderId||fields.Moid||fields.MOID||"",
      amount:payload.amount||Number(fields.Amt||0)
    },fields);

    fetch(confirmUrl,{
      method:"POST",
      headers:headers,
      credentials:"include",
      body:JSON.stringify(body)
    }).then(function(res){
      return res.json().catch(function(){return {};}).then(function(json){
        return {ok:res.ok,body:json};
      });
    }).then(function(result){
      if(result.ok&&result.body&&result.body.success!==false){
        var id=result.body.data&&result.body.data.order_id?result.body.data.order_id:(payload.orderId||fields.Moid||"");
        var uid=result.body.data&&result.body.data.uid?result.body.data.uid:"";
        location.replace(appOrigin()+"/shop/orders/"+encodeURIComponent(id)+(uid?"?uid="+encodeURIComponent(uid):""));
        return;
      }
      var msg=result.body&&(result.body.message||(result.body.error&&result.body.error.message))||"Nicepay payment confirmation failed.";
      show(msg);
      post({type:"shop-payment-result",status:"error",message:msg});
    }).catch(function(error){
      var msg=error&&error.message?error.message:"Nicepay payment confirmation failed.";
      show(msg);
      post({type:"shop-payment-result",status:"error",message:msg});
    });
    return;
  }

  var status=payload.status==="cancelled"?"cancelled":"error";
  var msg=payload.message||"Nicepay payment was not completed.";
  show(msg);
  post({type:"shop-payment-result",status:status,message:msg});
  closeLater();
}());
JS, [
        '__PAYLOAD__' => $payloadJson,
        '__TARGET__' => $targetJson,
        '__CONFIRM_URL__' => $confirmUrlJson,
    ]);
}

function pg_kcp_bridge_html(array $payload, string $targetOrigin = '*'): void {
    $targetOrigin = pg_post_message_origin($targetOrigin);
    $payloadJson = pg_bridge_json($payload);
    $targetJson = pg_bridge_json($targetOrigin);
    $message = (string) ($payload['message'] ?? 'KCP payment response received.');

    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ko"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>KCP Payment Return</title>';
    echo '<style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.card{max-width:420px;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:20px;box-shadow:0 20px 45px rgba(15,23,42,.12)}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#64748b;font-size:14px;line-height:1.5}</style>';
    echo '</head><body><div class="wrap"><div class="card"><h1>NHN KCP</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></div></div>';
    echo pg_bridge_script_tag(pg_kcp_bridge_script($payloadJson, $targetJson));
    echo '</body></html>';
    exit;
}

function pg_inicis_bridge_html(array $payload, string $targetOrigin = '*', string $externalScriptUrl = '', string $confirmPgService = 'inicis'): void {
    $targetOrigin = pg_post_message_origin($targetOrigin);
    $confirmPgService = strtolower(trim($confirmPgService));
    if (!in_array($confirmPgService, ['inicis', 'kakaopay'], true)) {
        $confirmPgService = 'inicis';
    }
    $payloadJson = pg_bridge_json($payload);
    $targetJson = pg_bridge_json($targetOrigin);
    $confirmUrlJson = pg_bridge_json(pg_api_url('/shop/payment/confirm'));
    $confirmPgServiceJson = pg_bridge_json($confirmPgService);
    $message = (string) ($payload['message'] ?? 'KG Inicis payment response received.');

    header_remove('X-Frame-Options');
    header('X-Frame-Options: SAMEORIGIN');
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ko"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>KG Inicis Payment Return</title>';
    echo '<style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.card{max-width:460px;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:20px;box-shadow:0 20px 45px rgba(15,23,42,.12)}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#64748b;font-size:14px;line-height:1.5}</style>';
    echo '</head><body><div class="wrap"><div class="card"><h1>KG Inicis</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></div></div>';
    echo pg_bridge_script_tag(pg_inicis_bridge_script($payloadJson, $targetJson, $confirmUrlJson, $confirmPgServiceJson));
    if ($externalScriptUrl !== '') {
        echo '<script src="' . htmlspecialchars($externalScriptUrl, ENT_QUOTES, 'UTF-8') . '" charset="UTF-8"></script>';
    }
    echo '</body></html>';
    exit;
}

function pg_nicepay_bridge_html(array $payload, string $targetOrigin = '*'): void {
    $targetOrigin = pg_post_message_origin($targetOrigin);
    if ($targetOrigin === '*') {
        $targetOrigin = pg_post_message_origin(pg_request_origin());
    }
    $payloadJson = pg_bridge_json($payload);
    $targetJson = pg_bridge_json($targetOrigin);
    $confirmUrlJson = pg_bridge_json(pg_api_url('/shop/payment/confirm'));
    $message = (string) ($payload['message'] ?? 'Nicepay payment response received.');

    header_remove('X-Frame-Options');
    header('X-Frame-Options: SAMEORIGIN');
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ko"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>Nicepay Payment Return</title>';
    echo '<style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.card{max-width:460px;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:20px;box-shadow:0 20px 45px rgba(15,23,42,.12)}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#64748b;font-size:14px;line-height:1.5}</style>';
    echo '</head><body><div class="wrap"><div class="card"><h1>Nicepay</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></div></div>';
    echo pg_bridge_script_tag(pg_nicepay_bridge_script($payloadJson, $targetJson, $confirmUrlJson));
    echo '</body></html>';
    exit;
}

function pg_inicis_script_html(string $scriptUrl): void {
    header_remove('X-Frame-Options');
    header('X-Frame-Options: SAMEORIGIN');
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ko"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>KG Inicis</title></head><body>';
    echo '<script src="' . htmlspecialchars($scriptUrl, ENT_QUOTES, 'UTF-8') . '" charset="UTF-8"></script>';
    echo '</body></html>';
    exit;
}

function pg_kcp_return_field(array $input, array $keys, string $default = ''): string {
    foreach ($keys as $key) {
        if (isset($input[$key]) && trim((string) $input[$key]) !== '') {
            return pg_kcp_message_to_utf8((string) $input[$key]);
        }
    }
    return $default;
}

// SC-01: 그누보드5 앱(kr.sirsoft.gnuboard5)의 브랜드 스킴 sirsoft-g5 를 허용하고 기본값으로 쓴다.
// youngcart / gnuboard 는 그대로 허용(하위 호환) — 바뀌는 것은 app_scheme 누락·미허용 시의 폴백 대상뿐.
const PG_ALLOWED_APP_SCHEMES = ['youngcart', 'gnuboard', 'sirsoft-g5'];
const PG_DEFAULT_APP_SCHEME = 'sirsoft-g5://';
// 앱 스킴으로 쓰면 결제 결과가 웹 주소·스크립트로 새는 이름 — 설정에 적혀 있어도 받지 않는다.
const PG_REJECTED_APP_SCHEMES = ['http', 'https', 'javascript', 'data', 'file', 'intent', 'about'];

function pg_scheme_name(string $raw): string {
    $trimmed = trim($raw);
    return strtolower(rtrim(strstr($trimmed, ':', true) ?: $trimmed, ':'));
}

/**
 * 허용 앱 스킴 = 기본 목록 + `G5_SOCIAL_MOBILE_SCHEMES`(쉼표 목록, api/.env·상수·서버 환경변수).
 * 내 사이트 앱(gnuboard5-app brand.json 의 scheme 을 바꾼 앱)은 소셜 로그인과 같은 이 설정 하나로 결제 복귀도 허용된다.
 */
function pg_allowed_app_schemes(): array {
    $configured = function_exists('g5_api_config_value')
        ? g5_api_config_value('G5_SOCIAL_MOBILE_SCHEMES')
        : (string) getenv('G5_SOCIAL_MOBILE_SCHEMES');
    $schemes = PG_ALLOWED_APP_SCHEMES;
    foreach (explode(',', $configured) as $item) {
        $scheme = pg_scheme_name($item);
        if (preg_match('/^[a-z][a-z0-9.+-]*$/', $scheme) && !in_array($scheme, PG_REJECTED_APP_SCHEMES, true)) {
            $schemes[] = $scheme;
        }
    }
    return array_values(array_unique($schemes));
}

function pg_normalize_app_scheme(string $raw): string {
    if (trim($raw) === '') return PG_DEFAULT_APP_SCHEME;

    $schemeOnly = pg_scheme_name($raw);
    if (!in_array($schemeOnly, pg_allowed_app_schemes(), true)) {
        return PG_DEFAULT_APP_SCHEME;
    }
    return $schemeOnly . '://';
}

function pg_mobile_deep_link(string $state, array $input): string {
    $appSchemeRaw = pg_mobile_request_value($input, ['app_scheme'], PG_DEFAULT_APP_SCHEME);
    $appScheme = pg_normalize_app_scheme($appSchemeRaw);
    $provider = pg_mobile_request_value($input, ['pg_service', 'provider'], 'toss');
    $orderId = pg_mobile_request_value($input, ['order_id', 'orderId', 'ordr_idxx', 'MOID', 'Moid', 'oid']);
    $amount = pg_mobile_request_value($input, ['amount', 'good_mny', 'Amt', 'TotPrice', 'price'], '0');

    $params = [
        'provider' => $provider,
        'orderId'  => $orderId,
        'amount'   => $amount,
    ];

    $passKeys = [
        'paymentKey', 'payment_key', 'paymentType',
        'authToken', 'AuthToken', 'authUrl', 'AuthUrl', 'netCancelUrl', 'NetCancelUrl',
        'P_AUTH_TOKEN', 'P_AUTH_URL', 'P_NET_CANCEL_URL', 'P_STATUS', 'P_RMESG1', 'P_TID', 'P_MID', 'P_OID', 'P_AMT',
        'tid', 'TID', 'TxTid', 'tno', 'TNO',
        'enc_info', 'enc_data', 'tran_cd', 'site_cd', 'use_pay_method', 'ret_pay_method',
        'res_cd', 'res_msg', 'resCd', 'resMsg',
        'ResultCode', 'ResultMsg', 'AuthResultCode', 'AuthResultMsg',
        'bankname', 'BankName', 'VbankBankName',
        'account', 'VbankNum', 'depositor', 'Depositor',
        'va_date', 'VbankExpDate', 'VbankExpTime',
    ];
    foreach ($passKeys as $key) {
        if (isset($input[$key]) && trim((string) $input[$key]) !== '') {
            $params[$key] = (string) $input[$key];
        }
    }

    return $appScheme . 'payment/' . $state . '?' . http_build_query($params);
}
