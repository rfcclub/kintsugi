## Why

`~/.anima/providers.d/` đã có 13 provider templates với đầy đủ metadata. Kintsugi không đọc được format này — wizard bắt nhập tay từ đầu. Import từ providers.d giúp user thêm provider trong 2-3 bước, không cần nhớ URL hay copy API key.

## What Changes

- Tạo `src/providers/template-scanner.ts` — scan + parse `~/.anima/providers.d/*.yaml`
- Tạo `src/providers/env-resolver.ts` — resolve `${ENV_VAR}` từ anima.env + process.env + .zshrc
- Refactor `ProviderWizard.tsx` thành 3 mode: import (từ providers.d), raw, oauth
- Map providers.d `api` field → kintsugi adapter type
- **BREAKING**: None. Backward compatible.

## Capabilities

### New Capabilities
- `provider-template-import`: Import provider từ providers.d YAML templates
- `env-resolver`: Resolve `${ENV_VAR}` references từ nhiều nguồn env
- `oauth-login`: OAuth flow cho `${OAUTH:*}` providers

### Modified Capabilities
- `ProviderWizard`: Thêm mode selector (import / raw / oauth)

## Impact

| File | Change |
|------|--------|
| `src/providers/template-scanner.ts` | **CREATE** — Parse providers.d YAML templates |
| `src/providers/env-resolver.ts` | **CREATE** — Resolve env var references |
| `src/ui/components/ProviderWizard.tsx` | Refactor thành 3-mode wizard |
| `tests/template-scanner.test.ts` | **CREATE** — Template scanner tests |
| `tests/env-resolver.test.ts` | **CREATE** — Env resolver tests |
| `tests/ui/provider-wizard.test.ts` | Thêm import/oauth mode tests |
