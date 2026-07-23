# Provider Registration Wizard — Specification

## Purpose

Define requirements for a TUI-based provider registration flow that allows users to add custom LLM providers through an interactive wizard, test connectivity, scan available models, and persist configuration automatically.

## Requirements

### Requirement: `/provider` SHALL show provider status

Kintsugi SHALL support `/provider` (no args) slash command that displays an overlay with the current provider's name, base URL, active model, and connection status.

#### Scenario: Show provider status
- **WHEN** user types `/provider` in TUI
- **THEN** Kintsugi displays an overlay with:
  - Provider name (e.g. "openai-chat", "groq")
  - Base URL (e.g. "https://api.openai.com/v1")
  - Active model (e.g. "gpt-4o")
  - Connection status indicator

### Requirement: `/provider add` SHALL open an interactive wizard

Kintsugi SHALL support `/provider add` that opens a multi-step wizard component.

#### Scenario: Open provider registration wizard
- **WHEN** user types `/provider add` in TUI
- **THEN** Kintsugi renders the ProviderWizard overlay
- **AND** the wizard starts at Step 1 (Provider Name)

### Requirement: Wizard SHALL collect provider name, URL, and API key

The wizard SHALL consist of at least 3 input steps before testing.

#### Scenario: Enter provider details through wizard steps
- **WHEN** user follows the wizard
- **AND** enters a provider name (e.g. "groq")
- **AND** enters a base URL (e.g. "https://api.groq.com/openai/v1")
- **AND** enters an API key (masked input)
- **THEN** the wizard moves to the testing step

#### Scenario: Validate provider name
- **WHEN** user enters an empty provider name or a name that already exists
- **THEN** the wizard shows a validation error
- **AND** does not proceed to the next step

#### Scenario: Validate base URL format
- **WHEN** user enters an invalid URL (e.g. "not-a-url")
- **THEN** the wizard shows a validation error
- **AND** does not proceed to the next step

#### Scenario: API key input masking
- **WHEN** user types the API key
- **THEN** the input SHALL display masked characters (e.g. `••••••••`)
- **AND** provide a toggle to show/hide the raw key

### Requirement: Wizard SHALL test connection and scan models

After collecting credentials, the wizard SHALL test the connection by calling the provider's `/models` endpoint and scanning available models.

#### Scenario: Connection test succeeds, models found
- **WHEN** the provider URL and API key are valid
- **AND** the provider returns a successful models list
- **THEN** the wizard shows a success indicator
- **AND** displays the list of discovered models
- **AND** proceeds to the confirmation step

#### Scenario: Connection test fails
- **WHEN** the provider URL is unreachable or API key is invalid
- **THEN** the wizard shows an error message
- **AND** allows the user to go back and edit the URL or key

#### Scenario: Model scanning fails gracefully
- **WHEN** the provider does not support `GET /models`
- **THEN** the wizard shows a warning
- **AND** allows the user to proceed with manual model entry
- **AND** does not block the registration flow

### Requirement: Wizard SHALL persist configuration

After confirmation, the wizard SHALL save the provider configuration to the config YAML and cache models to a JSON file.

#### Scenario: Save provider configuration
- **WHEN** the user confirms the registration
- **THEN** Kintsugi writes the provider config to `~/.config/kintsugi/config.yaml`
- **AND** writes the model list to `~/.config/kintsugi/model-cache.json`
- **AND** shows a success message
- **AND** the new provider is immediately available in the `/model` picker

#### Scenario: Backup existing config
- **WHEN** writing to config.yaml
- **THEN** Kintsugi creates a backup of the existing config as `config.yaml.bak`
- **BEFORE** overwriting the file

### Requirement: Registered providers SHALL appear in the picker

After registration, custom providers SHALL appear alongside built-in providers in the TUI model picker.

#### Scenario: Custom provider in picker
- **WHEN** user opens `/model` or the picker
- **AND** there are registered custom providers
- **THEN** the picker SHALL list all custom providers
- **AND** show an "Add new provider..." entry at the bottom

### Requirement: `/model` SHALL display cached models for selection

The `/model` slash command SHALL support listing and selecting models from `model-cache.json` for the currently active provider.

#### Scenario: `/model list` shows cached models
- **WHEN** user types `/model list` or `/model switch`
- **AND** the current provider has models in `model-cache.json`
- **THEN** Kintsugi displays a numbered list of available models
- **AND** the user can type a number to select a model
- **AND** the selected model is set as the active model immediately

#### Scenario: `/model` with no args still shows profiles
- **WHEN** user types `/model` without arguments
- **THEN** Kintsugi displays model profiles from config (existing behavior preserved)

#### Scenario: No cached models shows helpful message
- **WHEN** user types `/model list`
- **AND** the current provider has no models in `model-cache.json`
- **THEN** Kintsugi shows "No cached models. Run /provider add or configure manually."

#### Scenario: Model selection persists to config
- **WHEN** user selects a model from the cached list
- **THEN** Kintsugi writes the selected model to the provider config in config.yaml
- **AND** the model is loaded automatically on next TUI start

### Requirement: Wizard SHALL have OAuth placeholder

The wizard SHALL have a visible but non-functional OAuth option for future implementation.

#### Scenario: OAuth option is displayed
- **WHEN** user is on the API key input step
- **THEN** there SHALL be a visible "Use OAuth (coming soon)" option
- **AND** selecting it SHALL show a "Coming soon" message
- **AND** not block the API key input flow

## Traceability

| Scenario | Test File |
|----------|-----------|
| Show provider status | `tests/ui/provider-wizard.test.ts` (helpers), `src/ui/views/TuiView.tsx` (handler) |
| Open provider registration wizard | `tests/ui/provider-wizard.test.ts` (helpers), `src/ui/views/TuiView.tsx` (handler) |
| Enter provider details through wizard | `tests/ui/provider-wizard.test.ts` |
| Validate provider name | `tests/ui/provider-wizard.test.ts` |
| Validate base URL format | `tests/ui/provider-wizard.test.ts` |
| API key input masking | `tests/ui/provider-wizard.test.ts` |
| Connection test succeeds, models found | `tests/provider-scanner.test.ts` |
| Connection test fails | `tests/provider-scanner.test.ts` |
| Model scanning fails gracefully | `tests/provider-scanner.test.ts` |
| Save provider configuration | `tests/provider-config-writer.test.ts` |
| Backup existing config | `tests/provider-config-writer.test.ts` |
| Custom provider in picker | `tests/ui/provider-wizard.test.ts` (helpers), *Picker dynamic extension pending* |
| `/model list` shows cached models | `src/ui/views/TuiView.tsx` (handler), `tests/provider-cache.test.ts` |
| `/model` with no args still shows profiles | `src/ui/views/TuiView.tsx` (handler) |
| No cached models shows helpful message | `src/ui/views/TuiView.tsx` (handler) |
| Model selection persists to config | `tests/provider-config-writer.test.ts` (`setProviderDefaultModel`) |
| OAuth option is displayed | `src/ui/components/ProviderWizard.tsx`, `tests/ui/provider-wizard.test.ts` |
