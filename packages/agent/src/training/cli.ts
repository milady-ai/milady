/**
 * CLI entry point for the training data pipeline.
 *
 * Usage:
 *   bun run packages/agent/src/training/cli.ts generate --variants 5 --output ./training-data
 *   bun run packages/agent/src/training/cli.ts validate --input ./training-data/raw_samples.json
 *   bun run packages/agent/src/training/cli.ts export-trajectories --output ./training-data/trajectories.jsonl
 *   bun run packages/agent/src/training/cli.ts tune --project my-gcp-project --bucket my-bucket --model flash-lite --data ./training-data/should_respond_training.jsonl
 */

import { parseArgs } from "util";
import { readFile } from "fs/promises";
import {
  generateDataset,
  exportToGeminiJSONL,
  createAnthropicTeacher,
  createOpenAITeacher,
  type TeacherModel,
  type TrainingSample,
  type GenerationConfig,
} from "./dataset-generator.js";
import {
  validateDataset,
  formatQualityReport,
} from "./replay-validator.js";
import {
  createTuningJob,
  waitForTuningJob,
  listTuningJobs,
  type VertexTuningConfig,
} from "./vertex-tuning.js";
import { ALL_BLUEPRINTS } from "./scenario-blueprints.js";

function getTeacherModel(): TeacherModel {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    console.log("Using Anthropic Claude Sonnet 4 as teacher model");
    return createAnthropicTeacher(anthropicKey);
  }

  if (openaiKey) {
    console.log("Using OpenAI GPT-5 as teacher model");
    return createOpenAITeacher(openaiKey);
  }

  throw new Error(
    "No teacher model API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
  );
}

async function cmdGenerate(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      variants: { type: "string", default: "5" },
      output: { type: "string", default: "./training-data" },
      concurrency: { type: "string", default: "5" },
      contexts: { type: "string" },
      decisions: { type: "string" },
    },
  });

  const variantsPerBlueprint = parseInt(values.variants!, 10);
  const outputDir = values.output!;
  const concurrency = parseInt(values.concurrency!, 10);

  const filterContexts = values.contexts
    ? (values.contexts.split(",") as any[])
    : undefined;
  const filterDecisions = values.decisions
    ? (values.decisions.split(",") as any[])
    : undefined;

  const teacher = getTeacherModel();

  console.log(`\nScenario blueprints: ${ALL_BLUEPRINTS.length}`);
  console.log(`Variants per blueprint: ${variantsPerBlueprint}`);
  console.log(`Expected total samples: ${ALL_BLUEPRINTS.length * variantsPerBlueprint}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Teacher model: ${teacher.name}`);
  console.log(`Concurrency: ${concurrency}`);
  if (filterContexts) console.log(`Filter contexts: ${filterContexts.join(", ")}`);
  if (filterDecisions) console.log(`Filter decisions: ${filterDecisions.join(", ")}`);
  console.log("");

  const config: GenerationConfig = {
    variantsPerBlueprint,
    teacher,
    outputDir,
    concurrency,
    filterContexts,
    filterDecisions,
    onProgress: (completed, total, sample) => {
      const pct = ((completed / total) * 100).toFixed(1);
      process.stdout.write(
        `\r[${pct}%] ${completed}/${total} - ${sample.blueprintId} (${sample.expectedOutput.decision}/${sample.expectedOutput.primaryContext})`,
      );
    },
  };

  console.log("Generating synthetic training data...\n");
  const samples = await generateDataset(config);
  console.log(`\n\nGenerated ${samples.length} samples.`);

  // Validate
  console.log("\nValidating dataset...");
  const report = validateDataset(samples);
  console.log(formatQualityReport(report));

  // Export
  console.log("\nExporting to Gemini JSONL format...");
  const paths = await exportToGeminiJSONL(samples, outputDir);
  console.log(`  Combined: ${paths.combinedPath}`);
  console.log(`  Should-respond only: ${paths.shouldRespondPath}`);
  console.log(`  Context routing: ${paths.contextRoutingPath}`);
  console.log("\nDone!");
}

async function cmdValidate(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      input: { type: "string", short: "i" },
    },
  });

  if (!values.input) {
    console.error("Usage: validate --input <path-to-raw_samples.json>");
    process.exit(1);
  }

  const raw = await readFile(values.input, "utf-8");
  const samples: TrainingSample[] = JSON.parse(raw);

  console.log(`Loaded ${samples.length} samples from ${values.input}`);
  console.log("");

  const report = validateDataset(samples);
  console.log(formatQualityReport(report));
}

async function cmdTune(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
      bucket: { type: "string" },
      model: { type: "string", default: "gemini-2.5-flash-lite" },
      data: { type: "string" },
      validation: { type: "string" },
      name: { type: "string", default: "milady-should-respond" },
      epochs: { type: "string", default: "3" },
      region: { type: "string", default: "us-central1" },
    },
  });

  if (!values.project || !values.bucket || !values.data) {
    console.error(
      "Usage: tune --project <gcp-project> --bucket <gcs-bucket> --data <path-to-jsonl> [--model flash-lite|flash] [--name <display-name>]",
    );
    process.exit(1);
  }

  const baseModel =
    values.model === "flash"
      ? ("gemini-2.5-flash" as const)
      : ("gemini-2.5-flash-lite" as const);

  const config: VertexTuningConfig = {
    projectId: values.project,
    region: values.region,
    gcsBucket: values.bucket,
    baseModel,
    trainingDataPath: values.data,
    validationDataPath: values.validation,
    epochs: parseInt(values.epochs!, 10),
    displayName: values.name!,
  };

  console.log(`\nCreating tuning job...`);
  console.log(`  Project: ${config.projectId}`);
  console.log(`  Region: ${config.region}`);
  console.log(`  Base model: ${config.baseModel}`);
  console.log(`  Training data: ${config.trainingDataPath}`);
  console.log(`  Display name: ${config.displayName}`);
  console.log("");

  const job = await createTuningJob(config);
  console.log(`Job created: ${job.name}`);
  console.log(`State: ${job.state}`);

  console.log("\nPolling for completion (this may take hours)...");
  const final = await waitForTuningJob(job.name, {
    onPoll: (j) => {
      console.log(`  [${new Date().toISOString()}] ${j.state}`);
    },
  });

  if (final.state === "JOB_STATE_SUCCEEDED") {
    console.log(`\nTuning succeeded!`);
    console.log(`Tuned model endpoint: ${final.tunedModelEndpointName}`);
  } else {
    console.log(`\nTuning failed: ${final.error?.message ?? "unknown error"}`);
    process.exit(1);
  }
}

async function cmdListJobs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
      region: { type: "string", default: "us-central1" },
    },
  });

  if (!values.project) {
    console.error("Usage: list-jobs --project <gcp-project>");
    process.exit(1);
  }

  const jobs = await listTuningJobs(values.project, values.region);
  console.log(`\nTuning jobs for ${values.project}:\n`);
  for (const job of jobs) {
    console.log(`  ${job.name}`);
    console.log(`    State: ${job.state}`);
    console.log(`    Display name: ${job.tunedModelDisplayName}`);
    console.log(`    Created: ${job.createTime}`);
    if (job.tunedModelEndpointName) {
      console.log(`    Endpoint: ${job.tunedModelEndpointName}`);
    }
    console.log("");
  }
}

// ==================== Main ====================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case "generate":
      await cmdGenerate(restArgs);
      break;
    case "validate":
      await cmdValidate(restArgs);
      break;
    case "tune":
      await cmdTune(restArgs);
      break;
    case "list-jobs":
      await cmdListJobs(restArgs);
      break;
    default:
      console.log(`Usage: cli.ts <command> [options]

Commands:
  generate          Generate synthetic training data
    --variants N    Number of variants per blueprint (default: 5)
    --output DIR    Output directory (default: ./training-data)
    --concurrency N API call concurrency (default: 5)
    --contexts X,Y  Filter to specific contexts
    --decisions X,Y Filter to RESPOND,IGNORE,STOP

  validate          Validate a generated dataset
    --input PATH    Path to raw_samples.json

  tune              Start a Vertex AI fine-tuning job
    --project ID    GCP project ID
    --bucket NAME   GCS bucket for training data
    --data PATH     Path to training JSONL
    --model TYPE    flash-lite or flash (default: flash-lite)
    --name NAME     Display name (default: milady-should-respond)
    --epochs N      Training epochs (default: 3)
    --region REG    GCP region (default: us-central1)

  list-jobs         List Vertex AI tuning jobs
    --project ID    GCP project ID

Environment:
  ANTHROPIC_API_KEY   Use Claude as teacher model
  OPENAI_API_KEY      Use GPT-5 as teacher model
`);
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
