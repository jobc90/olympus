# Olympus 원격 접근 기술 검토 보고서

> **작성일**: 2026-02-06
> **작성**: Claude + Codex Co-Leadership 합의
> **목적**: 로컬 Olympus Gateway/Dashboard를 핸드폰에서 접근하는 방법 기술 검토

---

## 1. 현재 아키텍처 분석

### 1.1 네트워크 구성

| 서비스 | 바인딩 | 포트 | 프로토콜 | 인증 |
|--------|--------|------|----------|------|
| Gateway | `127.0.0.1` | 8200 | HTTP + WebSocket (`/ws`) | API Key (`oly_*`) |
| Dashboard | `127.0.0.1` | 8201 | HTTP (Static SPA) | 없음 (Gateway API Key 주입) |
| Telegram Bot | outbound only | - | HTTPS (Telegram API) | Bot Token + User ID |

### 1.2 핵심 코드 포인트

```
packages/client/src/client.ts:108    → ws://${host}:${port}/ws  (하드코딩 ws://)
packages/web/src/App.tsx:75          → http://${host}:${port}   (하드코딩 http://)
packages/web/src/hooks/useContextTree.ts:53 → http://localhost:8200
packages/cli/src/commands/server.ts:367     → window.__OLYMPUS_CONFIG__ (API Key HTML 주입)
packages/gateway/src/cors.ts:3-10          → ALLOWED_ORIGINS 명시적 목록
packages/gateway/src/server.ts:106         → server.listen(port, host) (127.0.0.1)
```

### 1.3 현재 원격 접근 방식

**Telegram Bot** — 이미 핸드폰에서 Claude CLI 조작 가능:
- Gateway WebSocket 연결 → 명령 전송/응답 수신
- `/sessions`, `/use`, `/orchestration` 등 지원

**부족한 점**:
- Dashboard(웹 UI) — localhost에서만 접근 가능
- Context Explorer, Task List, Agent Stream 등 시각적 모니터링 불가
- 세션 출력을 실시간으로 웹에서 볼 수 없음

---

## 2. 방안 비교

### 2.1 종합 비교표

| 방안 | 무료 | WS 지원 | HTTPS | 모바일 편의성 | 설정 난이도 | 보안 | 코드 변경 |
|------|------|---------|-------|-------------|-----------|------|----------|
| **Cloudflare Tunnel** | ✅ | ✅ | ✅ 자동 | ★★★★★ | ★★★☆☆ | ★★★★★ | **필요** |
| **ngrok** | ⚠️ 제한 | ⚠️ 불안정 | ✅ 자동 | ★★★★☆ | ★☆☆☆☆ | ★★★★☆ | **필요** |
| **Tailscale** | ✅ | ✅ | 불필요 | ★★★☆☆ | ★★☆☆☆ | ★★★★★ | **불필요** |
| **SSH 포워딩** | ⚠️ VPS | ✅ | 수동 | ★★★★☆ | ★★★★☆ | ★★★★☆ | 최소 |
| **VPS + Nginx** | ❌ $4+/mo | ✅ | ✅ 수동 | ★★★★★ | ★★★★★ | ★★★★★ | **필요** |
| **bore/frp/rathole** | ✅ (VPS) | ✅ | 수동 | ★★★☆☆ | ★★★★☆ | ★★★★☆ | 최소 |
| **Pinggy** | ⚠️ 60분 | ✅ | ✅ 자동 | ★★★★★ | ★☆☆☆☆ | ★★★☆☆ | **필요** |

### 2.2 각 방안 상세

#### A. Cloudflare Tunnel

**원리**: cloudflared 클라이언트가 Cloudflare 엣지에 아웃바운드 터널 생성. 인바운드 포트 오픈 불필요.

```bash
# 설치
brew install cloudflare/cloudflare/cloudflared

# 터널 생성
cloudflared tunnel login
cloudflared tunnel create olympus
cloudflared tunnel route dns olympus olympus.yourdomain.com

# 실행 (Gateway + Dashboard 모두)
cloudflared tunnel run --url http://localhost:8200 olympus
```

**장점**: 무료, HTTPS 자동, DDoS 보호, 전 세계 300+ PoP, Access(SSO/OTP) 연동 가능
**단점**: Cloudflare 계정 + 도메인 필요, **Mixed Content 문제** (아래 참조)

#### B. ngrok

```bash
ngrok http 8200 --basic-auth="user:pass"
```

**장점**: 한 줄 설정, 즉시 시작
**단점**: 무료 플랜 2시간 세션, 인터스티셜 페이지, 1GB/월 대역폭, WebSocket 불안정

#### C. Tailscale (P2P VPN)

```bash
# macOS에 설치
brew install tailscale
tailscale up

# 핸드폰에 Tailscale 앱 설치 → 같은 계정 로그인
# 핸드폰에서 http://<mac의-tailscale-IP>:8201 접속
```

**장점**: 코드 변경 0, http/ws 그대로 사용, E2E 암호화, P2P 최고 속도
**단점**: 핸드폰에 Tailscale 앱 설치 필요, 100대 디바이스 무료

#### D. Tailscale Serve (Tailnet 내 HTTPS 프록시)

```bash
# Gateway를 Tailnet 내에서 HTTPS로 서빙
tailscale serve --bg https+insecure://localhost:8200

# Dashboard도 서빙
tailscale serve --bg --set-path /dashboard https+insecure://localhost:8201
```

**장점**: HTTPS 자동, Tailnet ACL 보안, 코드 변경 최소
**단점**: Tailscale 앱 필요, Funnel(공개 접근)은 베타/제한적

#### E. VPS + Nginx + WireGuard

```
핸드폰 → HTTPS → VPS(Nginx) → WireGuard → 로컬 Mac → localhost:8200
```

**장점**: 완전 제어, 최고 보안(직접 관리), 커스텀 도메인
**단점**: VPS 비용($3.5+/mo), 설정 복잡, 유지보수 부담

#### F. 오픈소스 경량 터널 (bore, frp, rathole)

```bash
# bore 예시
bore local 8200 --to bore.pub
# 자체 서버: bore server --secret mysecret
```

**장점**: 오픈소스, 초경량, 자체 호스팅 시 완전 제어
**단점**: HTTPS 수동 설정, 공용 서버 신뢰성 낮음, VPS 필요

---

## 3. 핵심 기술 이슈

### 3.1 Mixed Content 문제 (Critical)

현재 코드는 프로토콜이 하드코딩되어 있습니다:

```typescript
// packages/client/src/client.ts:108
const url = `ws://${this.options.host}:${this.options.port}${GATEWAY_PATH}`;

// packages/web/src/App.tsx:75
baseUrl: `http://${config.host}:${config.port}`,
```

HTTPS 터널을 사용하면 브라우저는 `https://` 페이지에서 `ws://` (비암호화) 연결을 **차단**합니다 (Mixed Content Policy).

**해결 필요**:
```typescript
// 프로토콜 자동 감지 (구현 시)
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const httpProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
```

**영향받는 방안**: Cloudflare Tunnel, ngrok, Pinggy, VPS+Nginx (HTTPS 사용하는 모든 방안)
**영향없는 방안**: Tailscale (http/ws 그대로 사용)

### 3.2 API Key 노출 위험 (Critical)

현재 Dashboard는 서버에서 HTML에 API Key를 주입합니다:

```typescript
// packages/cli/src/commands/server.ts:367-371
const configScript = `<script>window.__OLYMPUS_CONFIG__=${JSON.stringify({
  host: gatewayConfig.gatewayHost,
  port: gatewayConfig.gatewayPort,
  apiKey: gatewayConfig.apiKey,  // ← API Key가 HTML에 노출
})};</script>`;
```

**localhost에서는 안전** — 외부 접근 불가
**원격 접근 시 위험** — 브라우저 소스 보기로 API Key 확인 가능 → **전체 Gateway 제어권 탈취**

**해결 옵션**:
1. **Tailscale 사용** → 사설 네트워크이므로 현재 방식 유지 가능
2. **HTTPS 터널 사용 시** → 서버측 세션 인증으로 전환 필요 (API Key 브라우저 주입 제거)
3. **Cloudflare Access** → SSO/OTP 1차 인증 레이어 추가

### 3.3 WebSocket Origin 검증 부재

Gateway의 WebSocket 서버는 `connect` 메시지의 `apiKey`만 검증하고, HTTP Origin 헤더를 검증하지 않습니다. CSRF 공격에 취약할 수 있습니다.

### 3.4 Gateway 바인딩 주소

현재 `127.0.0.1` 바인딩으로 외부 접근이 물리적으로 차단되어 있습니다. 일부 방안(Tailscale)은 Tailscale 인터페이스 IP로 바인딩 변경이 필요할 수 있습니다.

> Tailscale은 로컬 트래픽을 Tailscale IP로 프록시하므로 `0.0.0.0` 바인딩이 필요합니다. 또는 `tailscale serve`를 사용하면 프록시가 localhost로 연결하므로 변경 불필요.

---

## 4. 최종 판단

### 4.1 추천 순위

#### 🥇 1순위: Tailscale (+ Tailscale Serve)

| 항목 | 평가 |
|------|------|
| **코드 변경** | 없음 (http/ws 그대로) |
| **보안** | E2E 암호화, Zero-Trust, P2P |
| **설정 난이도** | 낮음 (앱 설치 + 로그인) |
| **비용** | 무료 (개인 100대) |
| **WebSocket** | 완벽 지원 (네트워크 레벨) |
| **속도** | 최고 (P2P 직접 연결) |

**추천 이유**:
1. **코드 변경이 전혀 필요 없음** — Mixed Content, API Key 노출 문제 모두 해당 없음
2. **보안 최강** — 사설 네트워크이므로 API Key HTML 주입도 안전
3. **설정 최소** — Mac에 Tailscale 설치 + 핸드폰에 앱 설치 + 같은 계정 로그인
4. **WebSocket 완벽** — TCP 레벨 터널이므로 ws:// 그대로 작동

**구현 가이드**:
```bash
# 1. macOS에 Tailscale 설치
brew install tailscale
sudo tailscale up

# 2. Gateway를 0.0.0.0으로 바인딩 (또는 tailscale serve 사용)
# 옵션 A: Host 바인딩 변경
olympus server start --host 0.0.0.0

# 옵션 B: tailscale serve (바인딩 변경 불필요, 권장)
tailscale serve --bg 8200              # Gateway
tailscale serve --bg --set-path /web 8201  # Dashboard

# 3. 핸드폰에서 Tailscale 앱 설치 (iOS/Android)
# 4. 같은 Tailscale 계정으로 로그인
# 5. 핸드폰 브라우저에서 접속:
#    http://<mac-tailscale-hostname>:8201  (옵션 A)
#    https://<mac-tailscale-hostname>/web   (옵션 B - HTTPS 자동)
```

**Olympus 코드 통합 방안** (선택적):
- `olympus server start --remote` 옵션 추가 → tailscale serve 자동 실행
- config.json에 `remoteAccess: { enabled: true, method: 'tailscale' }` 추가

---

#### 🥈 2순위: Cloudflare Tunnel + Access

| 항목 | 평가 |
|------|------|
| **코드 변경** | **필요** (http→https, ws→wss 프로토콜 자동 감지) |
| **보안** | 엔터프라이즈급 (DDoS 보호 + Access SSO) |
| **설정 난이도** | 중간 (계정 + 도메인 + 터널 생성) |
| **비용** | 무료 (도메인 비용만) |
| **WebSocket** | 지원 (HTTPS 위에서) |
| **속도** | 양호 (Cloudflare PoP 경유) |

**필수 코드 변경 목록**:

```
1. packages/client/src/client.ts:108
   ws:// → 프로토콜 자동 감지 (wss:// when HTTPS)

2. packages/web/src/App.tsx:75
   http:// → window.location.protocol 기반

3. packages/web/src/hooks/useContextTree.ts:53
   http://localhost → 상대 경로 또는 프로토콜 감지

4. packages/cli/src/commands/server.ts:367
   API Key HTML 주입 → 서버측 세션 인증 전환

5. packages/gateway/src/cors.ts
   ALLOWED_ORIGINS에 터널 도메인 추가

6. packages/gateway/src/server.ts
   WebSocket Origin 검증 추가
```

**추천 조건**: 앱 설치 없이 URL만으로 접근해야 하는 경우, 또는 제3자에게 공유해야 하는 경우

---

#### 🥉 3순위: Pinggy (임시 테스트/데모)

```bash
ssh -p 443 -R0:localhost:8200 -o StrictHostKeyChecking=no a.pinggy.io
```

**추천 조건**: 일시적으로 빠르게 테스트할 때 (60분 무료, QR 코드 지원)

---

### 4.2 비추천 방안

| 방안 | 비추천 이유 |
|------|------------|
| ngrok 무료 | 2시간 제한, 인터스티셜 페이지, WebSocket 불안정 |
| VPS + Nginx | 1인 개발자에게 운영 부담 과다 |
| localtunnel | 안정성/보안 모두 낮음 |

---

## 5. 보안 가이드라인

원격 접근 구현 시 **반드시** 적용해야 할 보안 조치:

### 5.1 필수 (Must-Have)

| 항목 | 설명 | 관련 코드 |
|------|------|----------|
| API Key 보호 | HTML 주입 제거 또는 사설 네트워크만 사용 | `server.ts:367` |
| HTTPS/WSS 강제 | 터널 사용 시 프로토콜 자동 감지 | `client.ts:108` |
| Origin 검증 | WebSocket 핸드셰이크에서 Origin 확인 | `server.ts` |
| 인증 레이어 | Cloudflare Access 또는 Tailscale ACL | 설정 수준 |

### 5.2 권장 (Should-Have)

| 항목 | 설명 |
|------|------|
| API Key 회전 | 주기적 갱신 또는 단기 토큰 |
| Rate Limiting | API 요청 빈도 제한 |
| 감사 로그 | 원격 접속 시도 기록 |
| 토큰/키 마스킹 | 로그에서 API Key 마스킹 |

---

## 6. 구현 로드맵 (제안)

### Phase 1: Tailscale 즉시 적용 (코드 변경 없음)

```bash
# 사용자가 직접 실행
brew install tailscale && sudo tailscale up
tailscale serve --bg 8200
tailscale serve --bg --set-path /web 8201
# 핸드폰 Tailscale 앱 설치 → 접속
```

### Phase 2: CLI 통합 (선택적 구현)

```bash
# olympus server start에 --remote 옵션 추가
olympus server start --remote          # tailscale serve 자동 실행
olympus server start --remote=tunnel   # cloudflared 자동 실행
```

### Phase 3: 프로토콜 자동 감지 (Cloudflare 지원 시)

```typescript
// client.ts - 프로토콜 자동 감지
const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
const wsProtocol = isSecure ? 'wss' : 'ws';
const url = `${wsProtocol}://${host}:${port}${GATEWAY_PATH}`;
```

### Phase 4: 보안 강화 (원격 접근 본격 사용 시)

- API Key 브라우저 주입 제거 → 서버측 세션 인증
- WebSocket Origin 검증 추가
- Rate Limiting 구현
- 감사 로그 추가

---

## 7. 결론

**Tailscale이 Olympus에 가장 적합한 방안입니다.**

핵심 근거:
1. **코드 변경 제로** — 현재 http/ws 하드코딩과 API Key HTML 주입이 모두 호환됨
2. **보안 최강** — E2E 암호화, 사설 네트워크, Zero-Trust 모델
3. **설정 최소** — 5분 이내 설정 완료 (양쪽 앱 설치 + 로그인)
4. **무료** — 개인 사용자 100대 디바이스까지 무료
5. **완벽한 WebSocket 지원** — 네트워크 레벨 터널이므로 프로토콜 무관

Cloudflare Tunnel은 URL 공유나 앱 설치 없는 접근이 필요한 경우 2순위로 고려하되, 코드 수정(프로토콜 자동 감지 + API Key 보호)이 선행되어야 합니다.

---

*이 보고서는 Claude + Codex Co-Leadership 합의를 거쳐 작성되었습니다.*
