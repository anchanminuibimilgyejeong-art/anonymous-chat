# 배포 메모

이 앱은 설치 의존성 없이 Node.js 18 이상에서 실행됩니다.

```bash
npm start
```

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
- 채팅 기록은 서버 메모리에만 짧게 보관

주의:

어떤 앱도 코드만으로 대규모 DDoS를 완전히 막을 수 없습니다. 대규모 공격 방어는 CDN/WAF, 호스팅 방화벽, 네트워크 레벨 제한이 같이 필요합니다.
