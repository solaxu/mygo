export type Participant = {
    id: string;
    label: string;
    agent: string;
    model?: string;
};
export type Workflow = {
    language?: string;
    archiveRoot?: string;
    concurrency?: number;
    retry?: number;
    reviewMatrix?: "full-cross";
    instructionFiles?: string[];
    templates?: {
        planner?: string;
        reviewer?: string;
    };
    validation?: {
        requiredPlannerHeadings?: string[];
        requiredReviewerHeadings?: string[];
    };
    participants: Participant[];
};
export type WorkflowsConfig = {
    defaultWorkflow?: string;
    archiveRoot?: string;
    workflows: Record<string, Workflow>;
};
export declare const DEFAULT_COMMAND_NAME = "plan-arena";
export declare const DEFAULT_WORKFLOW_NAME = "high-model-plan-review";
export declare const DEFAULT_ARCHIVE_ROOT = "~/.local/share/opencode/plans";
export declare const DEFAULT_LAUNCHER_AGENT = "plan-arena-launcher";
export declare const DEFAULT_LAUNCHER_MODEL = "opencode/deepseek-v4-flash-free";
export declare const DEFAULT_PARTICIPANTS: Participant[];
export declare const DEFAULT_INSTRUCTION_FILES: string[];
export declare const REQUIRED_PLANNER_HEADINGS: string[];
export declare const REQUIRED_REVIEWER_HEADINGS: string[];
export declare const DEFAULT_PLANNER_TEMPLATE = "You are one participant in a multi-model planning arena.\n\nOutput language: {{language}}\nWorkflow id: {{workflow_id}}\nParticipant: {{participant_label}} ({{participant_id}})\nProject root: {{project_root}}\n\nYou must create an implementation plan for the user's request. This is a planning-only task:\n\n- Do not edit files.\n- Do not execute shell commands.\n- Do not call subagents.\n- Read only the repository files needed to ground your plan.\n- Treat the configured instruction files below as binding.\n- Do not read other participants' archived plans.\n\nConfigured instruction files:\n\n{{instructions}}\n\nUser request:\n\n{{request}}\n\nReturn Markdown with exactly these required top-level sections:\n\n# \u5F00\u53D1\u8BA1\u5212\n\n## \u5DE5\u4F5C\u533A\u4E8B\u5B9E\n\nList the concrete files, APIs, configs, behavior, constraints, and implementation shape you found in the current workspace. Distinguish facts from assumptions.\n\n## \u51B3\u7B56\u8BA1\u5212\n\nGive a numbered implementation plan. For every step, include:\n\n- Decision: the exact implementation decision.\n- Basis: repository evidence or instruction that supports it.\n- Trade off: what this decision optimizes and what it gives up.\n- Risk: what could break or be missed.\n- Expected result: what should be true after the step is completed.\n\n## \u98CE\u9669\u4E0E\u9884\u671F\n\nSummarize cross-step risks, failure modes, compatibility concerns, and the expected end state.\n\n## \u9A8C\u6536\u6807\u51C6\n\nList concrete tests, checks, manual verification, and acceptance criteria.\n";
export declare const DEFAULT_REVIEWER_TEMPLATE = "You are reviewing and revising another model's implementation plan in a full-cross review round.\n\nOutput language: {{language}}\nWorkflow id: {{workflow_id}}\nOriginal planner: {{source_label}} ({{source_id}})\nReviewer: {{reviewer_label}} ({{reviewer_id}})\nProject root: {{project_root}}\n\nThis is a planning-only review task:\n\n- Do not edit files.\n- Do not execute shell commands.\n- Do not call subagents.\n- You may read repository files to verify the original plan against the actual workspace.\n- Do not review your own plan; the orchestration has selected a different original planner.\n- You may directly revise the plan, but every material change must state the original plan, the revised plan, the basis, the trade off, and risk impact.\n\nConfigured instruction files:\n\n{{instructions}}\n\nUser request:\n\n{{request}}\n\nOriginal plan:\n\n{{source_plan}}\n\nReturn Markdown with exactly these required top-level sections:\n\n# \u8BA1\u5212\u8BC4\u5BA1\u4FEE\u8BA2\n\n## \u539F\u8BA1\u5212\u6458\u8981\n\nSummarize the original plan's intent and main implementation path.\n\n## \u6539\u52A8\u6E05\u5355\n\nFor every material edit, use a table with columns:\n\n| \u539F\u8BA1\u5212 | \u4FEE\u8BA2\u540E | \u6539\u52A8\u4F9D\u636E | Trade off | \u98CE\u9669\u53D8\u5316 |\n| --- | --- | --- | --- | --- |\n\n## \u5B8C\u6574\u4FEE\u8BA2\u8BA1\u5212\n\nProvide a complete revised implementation plan that can be executed without reading the original plan. Every step must include Decision, Basis, Trade off, Risk, and Expected result.\n\n## \u98CE\u9669\u53D8\u5316\n\nSummarize risks added, reduced, or left unresolved by your revisions.\n\n## \u8BC4\u5BA1\u7ED3\u8BBA\n\nState whether the revised plan is ready for implementation and what should be watched most closely.\n";
export declare function createDefaultWorkflowsConfig(input?: {
    archiveRoot?: string;
    defaultWorkflow?: string;
    language?: string;
    concurrency?: number;
    retry?: number;
    participants?: Participant[];
}): WorkflowsConfig;
