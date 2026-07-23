# Kintsugi TUI Polish — Superpower Design

## Problem

Current TUI is functional but visually flat compared to Codex CLI, Claude Code, or Gemini CLI. Missing: visual hierarchy, personality, polish, and delight.

## Reference: What the Great Ones Do

### Codex CLI
- Full alternate screen
- Bold header with model name and status
- Role-prefixed messages with distinct colors
- Tool calls shown as collapsible cards with args/result
- Thinking/reasoning in dimmed italic
- Bottom input with `>` prompt
- Status indicators (streaming, idle, error)

### Claude Code
- Clean header with "Claude Code" branding
- Messages with `You:` / `Claude:` prefixes in bold
- Tool use shown as inline cards: tool name + args summary + result
- Thinking displayed as dimmed text with pause indicator
- Markdown rendered in terminal (bold, italic, code, lists)
- Bottom status bar with model and shortcuts
- Smooth streaming with cursor

### Gemini CLI
- Minimal header
- Clean message flow
- Code blocks with syntax-like styling
- Inline tool results

## Design: Kintsugi TUI v2

### Layout (Alternate Screen)

```
+-------------------------------------------------------------+
|  kintsugi  .  crof-deep/deepseek-v4-flash  .  approve       |
+-------------------------------------------------------------+
|                                                             |
|  > what is 2+2?                                             |
|                                                             |
|  2 + 2 = 4.                                                 |
|                                                             |
|  > read the config file                                     |
|                                                             |
|  +-- read_file ------------------------------------------+  |
|  |  config.yaml                                         |  |
|  |  ---------------------------------------------------- |  |
|  |  provider: mock                                      |  |
|  |  model: gpt-4.1-mini                                 |  |
|  |  ...                                                 |  |
|  +------------------------------------------------------+  |
|                                                             |
|  The config uses YAML format with provider and model...     |
|                                                             |
|  +-- Allow: bash ----------------------------------------+  |
|  |  {"command": "npm test"}                             |  |
|  |                                                      |  |
|  |  [y]es  [n]o  [a]lways                               |  |
|  +------------------------------------------------------+  |
|                                                             |
+-------------------------------------------------------------+
|  > type a message or /help                                  |
+-------------------------------------------------------------+
|  approve  .  crof-deep  .  4 msgs  .  ready      Shift+Tab  |
+-------------------------------------------------------------+
```

### Component Breakdown

#### 1. Header Bar
- Left: `kintsugi` in accent color + dot separator + model name
- Right: mode badge (colored: green=auto, cyan=approve, yellow=plan)
- Single-line border, accent color matches mode
- No round border — clean single line

#### 2. Transcript Area
- Full remaining height between header and composer
- User messages: `  > ` prefix in blue bold, no "you:" label
- Assistant messages: plain text, no prefix, with markdown hints
- Tool calls: bordered card with tool name header, args, and result
- Thinking: dimmed gray text with `~` prefix, collapsed by default
- Errors: red bordered card with `x` icon
- Empty state: welcome message with keyboard shortcuts
- Streaming: block cursor after text

#### 3. Tool Call Card
```
  +-- tool_name -------------------------------------------+
  |  arg1: value1                                          |
  |  -- result ------------------------------------------- |
  |  output text here...                                   |
  +--------------------------------------------------------+
```
- Tool name in cyan bold in the border header
- Args shown as key-value pairs (truncated)
- Result separated by a thin line
- Collapsed by default for long output (show first 3 lines + "...")

#### 4. Permission Prompt
```
  +-- Allow: bash -----------------------------------------+
  |  npm test                                              |
  |                                                        |
  |  [y]es  [n]o  [a]lways                                 |
  +--------------------------------------------------------+
```
- Round border, accent color
- Tool name in header
- Args as plain text (not JSON when possible)
- Key hints at bottom with colored first letters

#### 5. Composer
- `  > ` prompt in accent color
- Placeholder text in dim gray
- No border — blends into transcript area

#### 6. Status Bar
- Single-line border at bottom
- Left: mode (magenta bold) + dot + model name
- Right: message count + streaming state + "Shift+Tab" hint
- Compact, no wasted space

### Color Palette

| Element | Color | Usage |
|---------|-------|-------|
| Header accent | cyan/green/yellow | Mode-dependent |
| User messages | blue bold | `>` prefix |
| Assistant text | white | Body text |
| Tool cards | cyan | Border and name |
| Tool args/result | gray | Secondary text |
| Thinking | gray dimmed | Collapsed state |
| Errors | red | Border and text |
| Status mode | magenta | Bold label |
| Streaming cursor | cyan | Block character |
| Dimmed text | gray dimColor | Hints, placeholders |

### Typography

- No emoji or icons — use ASCII/Unicode box drawing
- Bold for labels and emphasis
- Dimmed for secondary information
- Box drawing for cards, `--` for separators
- Dot separator: `.` between status items

### Interactions

- `Shift+Tab`: cycle modes (auto -> approve -> plan)
- `/mode [auto|approve|plan]`: switch mode
- `/mode`: show mode overlay with descriptions
- `y/n/a`: respond to permission prompts
- `Esc`: cancel current action
- `Ctrl-C`: exit TUI
- `/clear`: clear transcript
- `/help`: show command list overlay

### Implementation Plan

1. **Update TuiView.tsx**: header bar, tool cards, markdown-ish rendering
2. **Update MessageBubble.tsx**: tool call cards with borders
3. **Update Composer.tsx**: cleaner prompt style
4. **Update StatusBar.tsx**: compact design with dot separators
5. **Add ToolCallCard.tsx**: bordered card for tool display
6. **Update Frame.tsx**: single-line header (not round box)
7. **Test in alternate screen**: verify layout at different terminal sizes

### Non-Goals (v2)

- No markdown parsing library (too heavy) — use simple regex for bold/code
- No image rendering
- No mouse support
- No split panes
- No themes system (hardcoded palette for now)
