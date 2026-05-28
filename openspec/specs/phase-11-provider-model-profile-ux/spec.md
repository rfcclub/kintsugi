# phase-11-provider-model-profile-ux Specification

## Purpose
Define Kintsugi in-TUI model profile UX: direct profile switching, active profile visibility, redacted inspection, and blocked-state feedback for invalid profile configuration.
## Requirements
### Requirement: Model Profile Commands Resolve Full Profile Settings

`/model <profile>` SHALL resolve configured `modelProfiles.<profile>` into the active provider, model, provider settings, and model config.

#### Scenario: Profile switches gateway settings

- **GIVEN** a profile named `example-kimi` with provider `openai-chat`, model `kimi-k2.6`, and settings `baseUrl: https://api.example.com/v1`
- **WHEN** `/model example-kimi` is handled
- **THEN** the active provider SHALL be recreated with `openai-chat`, model `kimi-k2.6`, and the Example base URL

### Requirement: Model Overlay Lists Configured Profiles

`/model` without arguments SHALL show an overlay listing configured model profiles and the active selection.

#### Scenario: Active profile is marked

- **GIVEN** `modelProfile: example-kimi` is active
- **WHEN** `/model` is handled
- **THEN** the overlay SHALL include `example-kimi [active]`

### Requirement: Model Inspect Redacts Secrets

`/model inspect` SHALL show active provider/model/profile details without printing API key contents.

#### Scenario: Key file is shown as source only

- **GIVEN** the active selection uses a key file
- **WHEN** `/model inspect` is handled
- **THEN** output SHALL include the key file path
- **AND** output SHALL NOT include API key contents

### Requirement: Invalid Profiles Are Blocked

Model profile UX SHALL indicate invalid configured profiles and SHALL reject switching to missing profile names.

#### Scenario: Unknown profile is rejected

- **WHEN** `/model missing` is handled
- **THEN** Kintsugi SHALL report `Unknown model profile: missing`

---

*Spec: Kintsugi - 2026-05-25*
