import { parseGgufMetadata } from "./ggufMetadata";
import { identifyModelChoice, architectureMatchesChoice } from "./modelCatalog";
import { inspectModelFile } from "./modelFile";
import { nodeFileStat, readFilePrefix } from "./nodeFileStatter";

async function main(): Promise<void> {
  const modelPath = process.argv[2];
  if (!modelPath) {
    console.error("Usage: npm run inspect-model -- <path-to-model.gguf>");
    console.error("This command only reads a file that is already on disk. It does not download a model.");
    process.exitCode = 1;
    return;
  }

  const info = await inspectModelFile(modelPath, nodeFileStat, (path) => readFilePrefix(path, 4));
  const header = await readFilePrefix(modelPath, 2_000_000);
  const metadata = header ? parseGgufMetadata(header) : { ok: false as const, error: "The file could not be read." };
  const choice = identifyModelChoice(modelPath);
  console.log(JSON.stringify({
    file: info,
    metadata,
    catalog: choice
      ? {
          id: choice.id,
          expectedArchitecture: choice.expectedArchitecture,
          architectureMatches: metadata.ok ? architectureMatchesChoice(metadata.metadata.architecture, choice) : false,
          runtimeNote: choice.runtimeNote,
        }
      : null,
  }, null, 2));
  if (!info.exists || info.ggufMagic === false || info.readable === false) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
