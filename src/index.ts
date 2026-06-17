import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { type Config, type Plugin, type PluginOptions, tool } from "@opencode-ai/plugin"
import {
  createDefaultWorkflowsConfig,
  DEFAULT_ARCHIVE_ROOT,
  DEFAULT_COMMAND_NAME,
  DEFAULT_LAUNCHER_AGENT,
  DEFAULT_LAUNCHER_MODEL,
  DEFAULT_PARTICIPANTS,
  DEFAULT_PLANNER_TEMPLATE,
  DEFAULT_REVIEWER_TEMPLATE,
  type Participant,
  type Workflow,
  type WorkflowsConfig,
} from "./defaults.js"

type TaskStatus = "pending" | "running" | "success" | "failed" | "skipped"

type TaskRecord = {
  id: string
  phase: "round1" | "round2"
  source?: string
  reviewer?: string
  participant?: string
  agent: string
  model?: string
  status: TaskStatus
  attempts: number
  sessionID?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  outputFile?: string
  error?: string
}

type Manifest = {
  workflow: string
  workflowId: string
  projectRoot: string
  projectSlug: string
  request: string
  createdAt: string
  updatedAt: string
  archiveDir: string
  status: "running" | "success" | "failed"
  tasks: Record<string, TaskRecord>
}

type RunArgs = {
  arguments?: string
  workflowId?: string
  request?: string
  workflow?: string
}

type NormalizedOptions = {
  commandName: string
  archiveRoot?: string
  defaultWorkflow?: string
  workflowPath?: string
  launcherModel: string
  participants?: Participant[]
  language?: string
  concurrency?: number
  retry?: number
}

type LoadedWorkflows = {
  config: WorkflowsConfig
  configDir?: string
}

type AgentConfig = {
  name: string
  description: string
  mode: "primary"
  model?: string
  temperature: number
  steps: number
  permission: Record<string, "allow" | "deny">
  prompt: string
  options: Record<string, never>
}

const READ_ONLY_TOOLS: Record<string, boolean> = {
  read: true,
  list: true,
  glob: true,
  grep: true,
  edit: false,
  write: false,
  bash: false,
  task: false,
  webfetch: false,
  websearch: false,
  todowrite: false,
  question: false,
  skill: false,
  plan_arena_run: false,
}

const PARTICIPANT_PERMISSION: Record<string, "allow" | "deny"> = {
  read: "allow",
  list: "allow",
  glob: "allow",
  grep: "allow",
  write: "deny",
  edit: "deny",
  bash: "deny",
  task: "deny",
  webfetch: "deny",
  websearch: "deny",
  todowrite: "deny",
  question: "deny",
  skill: "deny",
  plan_arena_run: "deny",
}

const LAUNCHER_PERMISSION: Record<string, "allow" | "deny"> = {
  read: "deny",
  list: "deny",
  glob: "deny",
  grep: "deny",
  write: "deny",
  edit: "deny",
  bash: "deny",
  task: "deny",
  webfetch: "deny",
  websearch: "deny",
  todowrite: "deny",
  question: "deny",
  skill: "deny",
  plan_arena_run: "allow",
}

function resolveHome(input: string): string {
  if (input === "~") return os.homedir()
  if (input.startsWith("~/") || input.startsWith("~\\")) return path.join(os.homedir(), input.slice(2))
  return input
}

function resolveUserPath(input: string, baseDir: string): string {
  const expanded = resolveHome(input)
  return path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded)
}

function slug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || "project"
}

function projectSlug(projectRoot: string): string {
  const base = slug(path.basename(projectRoot))
  const hash = createHash("sha1").update(path.resolve(projectRoot).toLowerCase()).digest("hex").slice(0, 8)
  return `${base}-${hash}`
}

function now(): string {
  return new Date().toISOString()
}

function textPart(text: string) {
  return {
    type: "text" as const,
    text,
  }
}

function relativeOrAbsolute(file: string, root: string): string {
  const rel = path.relative(root, file)
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return rel
  return file
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function readTextIfExists(file: string): Promise<string | undefined> {
  if (!existsSync(file)) return undefined
  return readFile(file, "utf8")
}

function stringOption(options: PluginOptions | undefined, key: string, fallback?: string): string | undefined {
  const value = options?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function numberOption(options: PluginOptions | undefined, key: string): number | undefined {
  const value = options?.[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeParticipants(input: unknown): Participant[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input)) throw new Error("Plan Arena option `participants` must be an array")

  return input.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Plan Arena participant at index ${index} must be an object`)
    }
    const record = item as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id.trim() : ""
    if (!id) throw new Error(`Plan Arena participant at index ${index} must define id`)

    const model = typeof record.model === "string" && record.model.trim() ? record.model.trim() : undefined
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : model
          ? model
          : id
    const agent =
      typeof record.agent === "string" && record.agent.trim() ? record.agent.trim() : `plan-arena-${slug(id)}`

    return {
      id,
      label,
      agent,
      model,
    }
  })
}

function normalizeOptions(options?: PluginOptions): NormalizedOptions {
  return {
    commandName: stringOption(options, "commandName", DEFAULT_COMMAND_NAME)!,
    archiveRoot: stringOption(options, "archiveRoot"),
    defaultWorkflow: stringOption(options, "defaultWorkflow"),
    workflowPath: stringOption(options, "workflowPath") ?? stringOption(options, "config"),
    launcherModel: stringOption(options, "launcherModel", DEFAULT_LAUNCHER_MODEL)!,
    participants: normalizeParticipants(options?.participants),
    language: stringOption(options, "language"),
    concurrency: numberOption(options, "concurrency"),
    retry: numberOption(options, "retry"),
  }
}

function applyOptionOverrides(config: WorkflowsConfig, options: NormalizedOptions): WorkflowsConfig {
  if (options.archiveRoot) config.archiveRoot = options.archiveRoot
  if (options.defaultWorkflow) config.defaultWorkflow = options.defaultWorkflow

  for (const workflow of Object.values(config.workflows)) {
    if (options.archiveRoot) workflow.archiveRoot = options.archiveRoot
    if (options.participants) workflow.participants = options.participants
    if (options.language) workflow.language = options.language
    if (options.concurrency !== undefined) workflow.concurrency = Math.max(1, Math.floor(options.concurrency))
    if (options.retry !== undefined) workflow.retry = Math.max(0, Math.floor(options.retry))
  }
  return config
}

async function loadWorkflowConfig(projectRoot: string, options: NormalizedOptions): Promise<LoadedWorkflows> {
  if (options.workflowPath) {
    const workflowPath = resolveUserPath(options.workflowPath, projectRoot)
    const config = await readJson<WorkflowsConfig>(workflowPath)
    return {
      config: applyOptionOverrides(config, options),
      configDir: path.dirname(workflowPath),
    }
  }

  return {
    config: createDefaultWorkflowsConfig({
      archiveRoot: options.archiveRoot ?? DEFAULT_ARCHIVE_ROOT,
      defaultWorkflow: options.defaultWorkflow,
      language: options.language,
      concurrency: options.concurrency,
      retry: options.retry,
      participants: options.participants ?? DEFAULT_PARTICIPANTS,
    }),
  }
}

function parseRunArgs(args: RunArgs): { workflowId: string; request: string; workflow?: string } {
  if (args.workflowId && args.request) {
    return {
      workflowId: args.workflowId.trim(),
      request: args.request.trim(),
      workflow: args.workflow?.trim(),
    }
  }

  const raw = (args.arguments ?? "").trim()
  const match = raw.match(/^(\S+)\s+([\s\S]+)$/)
  if (!match) {
    throw new Error("Usage: /plan-arena <workflow-id> <request>")
  }

  return {
    workflowId: match[1],
    request: match[2].trim(),
    workflow: args.workflow?.trim(),
  }
}

function validateWorkflow(config: WorkflowsConfig, name: string): Workflow {
  const workflow = config.workflows[name]
  if (!workflow) throw new Error(`Workflow not found: ${name}`)
  if (workflow.reviewMatrix && workflow.reviewMatrix !== "full-cross") {
    throw new Error(`Workflow ${name} uses unsupported reviewMatrix: ${workflow.reviewMatrix}`)
  }
  if (!Array.isArray(workflow.participants) || workflow.participants.length < 2) {
    throw new Error(`Workflow ${name} must define at least two participants`)
  }

  const ids = new Set<string>()
  for (const participant of workflow.participants) {
    if (!participant.id || !participant.label || !participant.agent) {
      throw new Error(`Every participant in ${name} must define id, label, and agent`)
    }
    if (ids.has(participant.id)) throw new Error(`Duplicate participant id: ${participant.id}`)
    ids.add(participant.id)
  }
  return workflow
}

async function loadInstructions(projectRoot: string, files: string[] = []): Promise<string> {
  const chunks: string[] = []
  for (const file of files) {
    const abs = path.resolve(projectRoot, file)
    const content = await readTextIfExists(abs)
    if (!content) continue
    chunks.push(`## ${file}\n\n${content.trim()}`)
  }
  return chunks.length ? chunks.join("\n\n---\n\n") : "No configured instruction files were found."
}

async function loadTemplate(
  configuredPath: string | undefined,
  configDir: string | undefined,
  projectRoot: string,
  fallback: string,
): Promise<string> {
  if (!configuredPath) return fallback
  const baseDir = configDir ?? projectRoot
  return readFile(resolveUserPath(configuredPath, baseDir), "utf8")
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_all, key: string) => vars[key] ?? "")
}

function extractText(response: any): string {
  const parts = response?.data?.parts ?? []
  return parts
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n")
    .trim()
}

function formatAssistantError(error: any): string {
  const data = error?.data
  const message = data?.message ?? error?.message ?? JSON.stringify(error)
  const status = data?.statusCode ? `status ${data.statusCode}: ` : ""
  return `${status}${message}`
}

function assertHeadings(output: string, headings: string[], taskId: string): void {
  const missing = headings.filter((heading) => !output.includes(heading))
  if (missing.length) {
    throw new Error(`Task ${taskId} output missing required heading(s): ${missing.join(", ")}`)
  }
}

function createManifest(params: {
  workflow: string
  workflowId: string
  projectRoot: string
  archiveDir: string
  request: string
}): Manifest {
  const createdAt = now()
  return {
    workflow: params.workflow,
    workflowId: params.workflowId,
    projectRoot: params.projectRoot,
    projectSlug: projectSlug(params.projectRoot),
    request: params.request,
    createdAt,
    updatedAt: createdAt,
    archiveDir: params.archiveDir,
    status: "running",
    tasks: {},
  }
}

async function loadOrCreateManifest(params: {
  workflow: string
  workflowId: string
  projectRoot: string
  archiveDir: string
  request: string
}): Promise<Manifest> {
  const file = path.join(params.archiveDir, "manifest.json")
  if (!existsSync(file)) return createManifest(params)

  const manifest = await readJson<Manifest>(file)
  if (manifest.workflow !== params.workflow) {
    throw new Error(`Existing manifest workflow mismatch: ${manifest.workflow} != ${params.workflow}`)
  }
  if (manifest.request !== params.request) {
    throw new Error("Existing manifest request differs from this run. Use a new workflow-id for a different request.")
  }
  manifest.status = "running"
  manifest.updatedAt = now()
  return manifest
}

async function writeIndex(manifest: Manifest): Promise<void> {
  const taskRows = Object.values(manifest.tasks)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((task) => {
      const output = task.outputFile ? relativeOrAbsolute(task.outputFile, manifest.archiveDir) : ""
      return `| ${task.id} | ${task.phase} | ${task.agent} | ${task.status} | ${task.attempts} | ${output} | ${task.error ?? ""} |`
    })
    .join("\n")

  const body = `# Plan Arena: ${manifest.workflowId}

## Summary

- Workflow: ${manifest.workflow}
- Status: ${manifest.status}
- Project: ${manifest.projectRoot}
- Archive: ${manifest.archiveDir}
- Created: ${manifest.createdAt}
- Updated: ${manifest.updatedAt}

## Request

${manifest.request}

## Tasks

| Task | Phase | Agent | Status | Attempts | Output | Error |
| --- | --- | --- | --- | --- | --- | --- |
${taskRows}
`

  await writeFile(path.join(manifest.archiveDir, "index.md"), body, "utf8")
}

async function saveManifest(manifest: Manifest): Promise<void> {
  manifest.updatedAt = now()
  await writeJson(path.join(manifest.archiveDir, "manifest.json"), manifest)
  await writeIndex(manifest)
}

function shouldSkip(task: TaskRecord): boolean {
  return task.status === "success" && !!task.outputFile && existsSync(task.outputFile)
}

async function runQueue<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      if (item) await run(item)
    }
  })
  await Promise.all(workers)
}

function collectParticipants(config: WorkflowsConfig): Participant[] {
  const participants = new Map<string, Participant>()
  for (const workflow of Object.values(config.workflows)) {
    for (const participant of workflow.participants ?? []) {
      participants.set(participant.agent, participant)
    }
  }
  return [...participants.values()]
}

function participantAgent(participant: Participant): AgentConfig {
  return {
    name: participant.agent,
    description: `Plan Arena participant bound to ${participant.label} for planning and cross-review tasks.`,
    mode: "primary",
    model: participant.model,
    temperature: 0.2,
    steps: 40,
    permission: PARTICIPANT_PERMISSION,
    prompt:
      "You are a Plan Arena participant. Follow the supplied task template exactly. Produce planning or review text only. Do not modify files, run shell commands, search the web, or call subagents.",
    options: {},
  }
}

function launcherAgent(model: string): AgentConfig {
  return {
    name: DEFAULT_LAUNCHER_AGENT,
    description: "Launches the Plan Arena plugin tool for multi-model planning workflows.",
    mode: "primary",
    model,
    temperature: 0,
    steps: 1,
    permission: LAUNCHER_PERMISSION,
    prompt:
      "You are only a launcher for the `plan_arena_run` tool.\n\nWhen invoked, call `plan_arena_run` exactly once with the raw command arguments supplied by the command template. Do not inspect files and do not answer from your own reasoning.",
    options: {},
  }
}

async function injectOpenCodeConfig(
  cfg: Config,
  projectRoot: string,
  options: NormalizedOptions,
): Promise<void> {
  const loaded = await loadWorkflowConfig(projectRoot, options)
  const config = cfg as Config & {
    command?: Record<string, unknown>
    agent?: Record<string, unknown>
  }

  config.command ??= {}
  config.command[options.commandName] = {
    description: "Run the configured multi-model planning and cross-review arena.",
    agent: DEFAULT_LAUNCHER_AGENT,
    model: options.launcherModel,
    template:
      "Call the `plan_arena_run` tool exactly once. Pass the raw command arguments below in the `arguments` field without rewriting them. Do not inspect the repository yourself.\n\n$ARGUMENTS",
  }

  config.agent ??= {}
  config.agent[DEFAULT_LAUNCHER_AGENT] = launcherAgent(options.launcherModel)
  for (const participant of collectParticipants(loaded.config)) {
    config.agent[participant.agent] = participantAgent(participant)
  }
}

export const PlanArenaPlugin: Plugin = async ({ client, directory, worktree }, pluginOptions) => {
  const options = normalizeOptions(pluginOptions)
  const projectBase = path.resolve(directory || worktree || process.cwd())

  return {
    async config(cfg) {
      await injectOpenCodeConfig(cfg, projectBase, options)
    },

    tool: {
      plan_arena_run: tool({
        description: "Run a configured multi-model planning and cross-review workflow, then archive every result.",
        args: {
          arguments: tool.schema.string().optional().describe("Raw command arguments: <workflow-id> <request>"),
          workflowId: tool.schema.string().optional().describe("Stable archive id for this run"),
          request: tool.schema.string().optional().describe("The user request to plan"),
          workflow: tool.schema.string().optional().describe("Workflow name; defaults to the configured default workflow"),
        },
        async execute(args, context) {
          const parsed = parseRunArgs(args)
          const projectRoot = path.resolve(context.directory || context.worktree)
          const loaded = await loadWorkflowConfig(projectRoot, options)
          const config = loaded.config
          const workflowName = parsed.workflow || config.defaultWorkflow || Object.keys(config.workflows)[0]
          const workflow = validateWorkflow(config, workflowName)
          const archiveRoot = resolveHome(workflow.archiveRoot || config.archiveRoot || DEFAULT_ARCHIVE_ROOT)
          const archiveDir = path.join(archiveRoot, projectSlug(projectRoot), workflowName, slug(parsed.workflowId))
          const plannerTemplate = await loadTemplate(
            workflow.templates?.planner,
            loaded.configDir,
            projectRoot,
            DEFAULT_PLANNER_TEMPLATE,
          )
          const reviewerTemplate = await loadTemplate(
            workflow.templates?.reviewer,
            loaded.configDir,
            projectRoot,
            DEFAULT_REVIEWER_TEMPLATE,
          )
          const instructions = await loadInstructions(projectRoot, workflow.instructionFiles)
          const concurrency = Math.max(1, workflow.concurrency ?? 2)
          const retry = Math.max(0, workflow.retry ?? 1)
          const plannerHeadings = workflow.validation?.requiredPlannerHeadings ?? []
          const reviewerHeadings = workflow.validation?.requiredReviewerHeadings ?? []

          await mkdir(path.join(archiveDir, "round1"), { recursive: true })
          await mkdir(path.join(archiveDir, "round2"), { recursive: true })
          await writeFile(path.join(archiveDir, "request.md"), `# Request\n\n${parsed.request}\n`, "utf8")

          const manifest = await loadOrCreateManifest({
            workflow: workflowName,
            workflowId: parsed.workflowId,
            projectRoot,
            archiveDir,
            request: parsed.request,
          })
          await saveManifest(manifest)

          const runModelTask = async (task: TaskRecord, prompt: string, requiredHeadings: string[]) => {
            if (shouldSkip(task)) {
              await saveManifest(manifest)
              return
            }

            for (let attempt = 1; attempt <= retry + 1; attempt++) {
              const started = Date.now()
              task.status = "running"
              task.attempts = attempt
              task.startedAt = now()
              delete task.error
              await saveManifest(manifest)

              try {
                const session = await client.session.create({
                  query: { directory: projectRoot },
                  body: { title: `plan-arena ${manifest.workflowId} ${task.id}` },
                })
                if (session.error || !session.data) {
                  throw new Error(JSON.stringify(session.error ?? "session.create returned no data"))
                }
                task.sessionID = session.data.id

                const response = await client.session.prompt({
                  path: { id: session.data.id },
                  query: { directory: projectRoot },
                  body: {
                    agent: task.agent,
                    tools: READ_ONLY_TOOLS,
                    parts: [textPart(prompt)],
                  },
                })
                if (response.error) throw new Error(JSON.stringify(response.error))
                if (response.data?.info?.error) {
                  throw new Error(formatAssistantError(response.data.info.error))
                }

                const output = extractText(response)
                if (!output) throw new Error("Model returned no text output")
                assertHeadings(output, requiredHeadings, task.id)

                if (!task.outputFile) throw new Error(`Task ${task.id} has no outputFile`)
                await mkdir(path.dirname(task.outputFile), { recursive: true })
                await writeFile(task.outputFile, output.endsWith("\n") ? output : `${output}\n`, "utf8")

                task.status = "success"
                task.finishedAt = now()
                task.durationMs = Date.now() - started
                await saveManifest(manifest)
                return
              } catch (error) {
                task.status = "failed"
                task.finishedAt = now()
                task.durationMs = Date.now() - started
                task.error = error instanceof Error ? error.message : String(error)
                await saveManifest(manifest)
                if (attempt > retry) {
                  manifest.status = "failed"
                  await saveManifest(manifest)
                  throw error
                }
              }
            }
          }

          const round1Tasks = workflow.participants.map((participant) => {
            const id = `round1-${participant.id}`
            const task: TaskRecord =
              manifest.tasks[id] ?? {
                id,
                phase: "round1",
                participant: participant.id,
                agent: participant.agent,
                model: participant.model,
                status: "pending",
                attempts: 0,
                outputFile: path.join(archiveDir, "round1", `${participant.id}.md`),
              }
            task.outputFile = path.join(archiveDir, "round1", `${participant.id}.md`)
            manifest.tasks[id] = task
            return { participant, task }
          })
          await saveManifest(manifest)

          await runQueue(round1Tasks, concurrency, async ({ participant, task }) => {
            const prompt = applyTemplate(plannerTemplate, {
              language: workflow.language ?? "zh-CN",
              workflow_id: manifest.workflowId,
              participant_id: participant.id,
              participant_label: participant.label,
              request: parsed.request,
              project_root: projectRoot,
              instructions,
            })
            await runModelTask(task, prompt, plannerHeadings)
          })

          const round2Tasks: Array<{
            source: Participant
            reviewer: Participant
            task: TaskRecord
            sourcePlan: string
          }> = []
          for (const source of workflow.participants) {
            const sourcePlanFile = path.join(archiveDir, "round1", `${source.id}.md`)
            const sourcePlan = await readFile(sourcePlanFile, "utf8")
            for (const reviewer of workflow.participants) {
              if (reviewer.id === source.id) continue
              const id = `round2-${source.id}-by-${reviewer.id}`
              const outputFile = path.join(archiveDir, "round2", source.id, `${reviewer.id}.md`)
              const task: TaskRecord =
                manifest.tasks[id] ?? {
                  id,
                  phase: "round2",
                  source: source.id,
                  reviewer: reviewer.id,
                  agent: reviewer.agent,
                  model: reviewer.model,
                  status: "pending",
                  attempts: 0,
                  outputFile,
                }
              task.outputFile = outputFile
              manifest.tasks[id] = task
              round2Tasks.push({ source, reviewer, task, sourcePlan })
            }
          }
          await saveManifest(manifest)

          await runQueue(round2Tasks, concurrency, async ({ source, reviewer, task, sourcePlan }) => {
            const prompt = applyTemplate(reviewerTemplate, {
              language: workflow.language ?? "zh-CN",
              workflow_id: manifest.workflowId,
              source_id: source.id,
              source_label: source.label,
              reviewer_id: reviewer.id,
              reviewer_label: reviewer.label,
              request: parsed.request,
              project_root: projectRoot,
              instructions,
              source_plan: sourcePlan,
            })
            await runModelTask(task, prompt, reviewerHeadings)
          })

          manifest.status = "success"
          await saveManifest(manifest)

          return {
            output: `Plan arena completed: ${archiveDir}`,
            metadata: {
              workflow: workflowName,
              workflowId: manifest.workflowId,
              archiveDir,
              tasks: Object.keys(manifest.tasks).length,
            },
          }
        },
      }),
    },
  }
}

export default PlanArenaPlugin
