# Shared Memory Contract

This phase hardens the event contract used by companion runtime and kintsugi.

## Event Envelope

Every `ops.log` line is JSON with:

- `id`: string
- `kind`: `op`, `learn`, `echo`, or `note`
- `actor`: `external`, `kintsugi`, or `kintsugi`
- `payload`: object shape determined by `kind`
- `at`: ISO-compatible timestamp string

## Payload Conventions

`learn`:

```json
{"key":"user.prefers","value":"direct answers"}
```

`note`:

```json
{"text":"Kintsugi should keep replies compact."}
```

`echo`:

```json
{"path":"~/.config/kintsugi/substrate","hash":"abc"}
```

`op`:

```json
{"action":"built","target":"phase-9"}
```

Malformed lines and unsupported shapes are skipped with warnings; valid events before and after them must still reconstruct.
