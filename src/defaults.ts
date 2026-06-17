export type Participant = {
  id: string
  label: string
  agent: string
  model?: string
}

export type Workflow = {
  language?: string
  archiveRoot?: string
  concurrency?: number
  retry?: number
  reviewMatrix?: "full-cross"
  instructionFiles?: string[]
  templates?: {
    planner?: string
    reviewer?: string
  }
  validation?: {
    requiredPlannerHeadings?: string[]
    requiredReviewerHeadings?: string[]
  }
  participants: Participant[]
}

export type WorkflowsConfig = {
  defaultWorkflow?: string
  archiveRoot?: string
  workflows: Record<string, Workflow>
}

export const DEFAULT_COMMAND_NAME = "plan-arena"
export const DEFAULT_WORKFLOW_NAME = "high-model-plan-review"
export const DEFAULT_ARCHIVE_ROOT = "~/.local/share/opencode/plans"
export const DEFAULT_LAUNCHER_AGENT = "plan-arena-launcher"
export const DEFAULT_LAUNCHER_MODEL = "opencode/deepseek-v4-flash-free"

export const DEFAULT_PARTICIPANTS: Participant[] = [
  {
    id: "glm51",
    label: "GLM 5.1",
    agent: "plan-arena-glm-5-1",
    model: "opencode-go/glm-5.1",
  },
  {
    id: "qwen37max",
    label: "Qwen3.7 Max",
    agent: "plan-arena-qwen3-7-max",
    model: "opencode-go/qwen3.7-max",
  },
  {
    id: "kimi-k27-code",
    label: "Kimi K2.7 Code",
    agent: "plan-arena-kimi-k2-7-code",
    model: "opencode-go/kimi-k2.7-code",
  },
  {
    id: "mimo-v25-pro",
    label: "MiMo V2.5 Pro",
    agent: "plan-arena-mimo-v2-5-pro",
    model: "opencode-go/mimo-v2.5-pro",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    agent: "plan-arena-deepseek-v4-pro",
    model: "opencode-go/deepseek-v4-pro",
  },
]

export const DEFAULT_INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "CLAUDE.local.md"]

export const REQUIRED_PLANNER_HEADINGS = [
  "# 开发计划",
  "## 工作区事实",
  "## 决策计划",
  "## 风险与预期",
  "## 验收标准",
]

export const REQUIRED_REVIEWER_HEADINGS = [
  "# 计划评审修订",
  "## 原计划摘要",
  "## 改动清单",
  "## 完整修订计划",
  "## 风险变化",
  "## 评审结论",
]

export const DEFAULT_PLANNER_TEMPLATE = `You are one participant in a multi-model planning arena.

Output language: {{language}}
Workflow id: {{workflow_id}}
Participant: {{participant_label}} ({{participant_id}})
Project root: {{project_root}}

You must create an implementation plan for the user's request. This is a planning-only task:

- Do not edit files.
- Do not execute shell commands.
- Do not call subagents.
- Read only the repository files needed to ground your plan.
- Treat the configured instruction files below as binding.
- Do not read other participants' archived plans.

Configured instruction files:

{{instructions}}

User request:

{{request}}

Return Markdown with exactly these required top-level sections:

# 开发计划

## 工作区事实

List the concrete files, APIs, configs, behavior, constraints, and implementation shape you found in the current workspace. Distinguish facts from assumptions.

## 决策计划

Give a numbered implementation plan. For every step, include:

- Decision: the exact implementation decision.
- Basis: repository evidence or instruction that supports it.
- Trade off: what this decision optimizes and what it gives up.
- Risk: what could break or be missed.
- Expected result: what should be true after the step is completed.

## 风险与预期

Summarize cross-step risks, failure modes, compatibility concerns, and the expected end state.

## 验收标准

List concrete tests, checks, manual verification, and acceptance criteria.
`

export const DEFAULT_REVIEWER_TEMPLATE = `You are reviewing and revising another model's implementation plan in a full-cross review round.

Output language: {{language}}
Workflow id: {{workflow_id}}
Original planner: {{source_label}} ({{source_id}})
Reviewer: {{reviewer_label}} ({{reviewer_id}})
Project root: {{project_root}}

This is a planning-only review task:

- Do not edit files.
- Do not execute shell commands.
- Do not call subagents.
- You may read repository files to verify the original plan against the actual workspace.
- Do not review your own plan; the orchestration has selected a different original planner.
- You may directly revise the plan, but every material change must state the original plan, the revised plan, the basis, the trade off, and risk impact.

Configured instruction files:

{{instructions}}

User request:

{{request}}

Original plan:

{{source_plan}}

Return Markdown with exactly these required top-level sections:

# 计划评审修订

## 原计划摘要

Summarize the original plan's intent and main implementation path.

## 改动清单

For every material edit, use a table with columns:

| 原计划 | 修订后 | 改动依据 | Trade off | 风险变化 |
| --- | --- | --- | --- | --- |

## 完整修订计划

Provide a complete revised implementation plan that can be executed without reading the original plan. Every step must include Decision, Basis, Trade off, Risk, and Expected result.

## 风险变化

Summarize risks added, reduced, or left unresolved by your revisions.

## 评审结论

State whether the revised plan is ready for implementation and what should be watched most closely.
`

export function createDefaultWorkflowsConfig(input?: {
  archiveRoot?: string
  defaultWorkflow?: string
  language?: string
  concurrency?: number
  retry?: number
  participants?: Participant[]
}): WorkflowsConfig {
  const workflowName = input?.defaultWorkflow ?? DEFAULT_WORKFLOW_NAME
  const archiveRoot = input?.archiveRoot ?? DEFAULT_ARCHIVE_ROOT

  return {
    defaultWorkflow: workflowName,
    archiveRoot,
    workflows: {
      [workflowName]: {
        language: input?.language ?? "zh-CN",
        archiveRoot,
        concurrency: input?.concurrency ?? 2,
        retry: input?.retry ?? 1,
        reviewMatrix: "full-cross",
        instructionFiles: DEFAULT_INSTRUCTION_FILES,
        validation: {
          requiredPlannerHeadings: REQUIRED_PLANNER_HEADINGS,
          requiredReviewerHeadings: REQUIRED_REVIEWER_HEADINGS,
        },
        participants: input?.participants ?? DEFAULT_PARTICIPANTS,
      },
    },
  }
}
