# opencode-plan-arena

OpenCode plugin for a two-round multi-model planning workflow.

The plugin has no hardcoded project path. Defaults are bundled in the package. At runtime it only reads the current OpenCode project directory and the instruction files configured by the workflow.

## Install

Install from a private Git npm source:

```bash
opencode plugin https://github.com/solaxu/mygo/archive/refs/heads/main.tar.gz -g --force
```

Restart OpenCode after installation.

OpenCode 1.17.7 may fail on direct Git dependency specs such as `git+https://github.com/solaxu/mygo.git` with `git dep preparation failed`. The GitHub branch tarball URL above installs from the same private repository and has been verified with `opencode plugin`.

## Use

```text
/plan-arena <workflow-id> <request>
```

Example:

```text
/plan-arena auth-refactor Design a safe implementation plan for the requested refactor.
```

By default the plugin runs:

1. Round 1: each participant model creates an implementation plan.
2. Round 2: every other model reviews and may revise each plan.
3. Archive: request, manifest, index, round 1 plans, and round 2 reviews are written under the archive root.

Default archive root:

```text
~/.local/share/opencode/plans
```

## Default Models

- `opencode-go/glm-5.1`
- `opencode-go/qwen3.7-max`
- `opencode-go/kimi-k2.7-code`
- `opencode-go/mimo-v2.5-pro`
- `opencode-go/deepseek-v4-pro`

The launcher uses `opencode/deepseek-v4-flash-free`.

## Configuration

The plugin automatically registers:

- `/plan-arena`
- `plan_arena_run`
- `plan-arena-launcher`
- one primary agent for each participant model

Optional plugin settings can override defaults:

```jsonc
{
  "plugin": [
    [
      "opencode-plan-arena",
      {
        "commandName": "plan-arena",
        "archiveRoot": "~/.local/share/opencode/plans",
        "launcherModel": "opencode/deepseek-v4-flash-free",
        "defaultWorkflow": "high-model-plan-review"
      }
    ]
  ]
}
```

To use a custom workflow file:

```jsonc
{
  "plugin": [
    [
      "opencode-plan-arena",
      {
        "workflowPath": "./opencode-plan-arena.json"
      }
    ]
  ]
}
```

Relative `workflowPath` values are resolved from the current OpenCode project root. Relative template paths inside that workflow file are resolved from the workflow file's own directory.

## Custom Participants

```jsonc
{
  "plugin": [
    [
      "opencode-plan-arena",
      {
        "participants": [
          {
            "id": "planner-a",
            "label": "Planner A",
            "agent": "plan-arena-planner-a",
            "model": "provider/model-a"
          },
          {
            "id": "planner-b",
            "label": "Planner B",
            "agent": "plan-arena-planner-b",
            "model": "provider/model-b"
          }
        ]
      }
    ]
  ]
}
```

Each workflow must have at least two participants.

## Build

```bash
npm install
npm run build
npm pack
```

## Verify

```bash
opencode debug config
opencode agent list
```

Confirm that the command and `plan-arena-*` agents are present. A real workflow run also requires the selected model provider account to have available balance.
