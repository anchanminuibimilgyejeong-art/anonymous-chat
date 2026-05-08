# 배포 메모

이 앱은 Node.js 18 이상에서 실행됩니다.

```bash
npm start
```

## 데이터베이스

PostgreSQL 연결 문자열을 서버 환경 변수에 넣으면 채팅 기록이 DB에 저장됩니다.
브라우저 파일(`public/app.js`)에는 DB 주소나 비밀번호를 절대 넣지 않습니다.

Render 환경 변수:

```text
SERVER_SECRET=길고랜덤한문자
DATABASE_URL=postgresql://...
```

`DATABASE_URL`이 없으면 DB 없이 메모리에만 저장됩니다.
서버가 시작될 때 `messages` 테이블은 자동으로 만들어집니다.

운영 배포 시 권장 설정:

- Cloudflare, Fastly, AWS CloudFront 같은 CDN/WAF 앞에 둡니다.
- HTTPS를 강제합니다.
- `SERVER_SECRET` 환경 변수를 길고 랜덤한 값으로 설정합니다.
- 프록시에서 요청 본문 크기 제한과 초당 요청 제한을 추가합니다.
- 서버 로그에 IP, User-Agent, 메시지 전문을 남기지 않도록 설정합니다.

앱 내부 방어:

- IP 원문 저장 없음, HMAC 해시로만 임시 rate limit 처리
- 메시지 길이 제한 및 제어 문자 제거
- 요청/메시지/스트림별 token bucket rate limit
- 보안 헤더와 엄격한 CSP
- 메시지를 `textContent`로 렌더링하여 스크립트 삽입 방지
- DB 사용 시 채팅 기록은 PostgreSQL에 저장, IP 원문은 저장하지 않음
- DB 미사용 시 채팅 기록은 서버 메모리에만 짧게 보관

주의:

어떤 앱도 코드만으로 대규모 DDoS를 완전히 막을 수 없습니다. 대규모 공격 방어는 CDN/WAF, 호스팅 방화벽, 네트워크 레벨 제한이 같이 필요합니다.
