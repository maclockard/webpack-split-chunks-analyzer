import yargs from "yargs";
import { promises } from "fs";
import { Stats } from "webpack";
import prettyBytes from "pretty-bytes";
import { chainFrom } from "transducist";
import graphviz from "graphviz";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const { readFile, writeFile } = promises;

export default function run() {
  yargs
    .command(
      "$0 <statsFilePath> [--verbose]",
      "analyze a webpack stats file",
      (yargs) =>
        yargs
          .options({
            verbose: {
              description: "output more info",
              type: "boolean",
              default: false,
            },
            outputFilePath: {
              alias: "o",
              description: "where the resulting graph should go (excluding extension)",
              type: "string",
              default: "webpack-split-chunks-report",
            },
            outputFileType: {
              alias: "t",
              description: "what file format to output",
              type: "string",
              default: "pdf",
            },
            openOnFinish: {
              description: "open the result when finished",
              type: "boolean",
              default: true,
            },
          })
          .positional("statsFilePath", {
            description: "path of the stats json file to analyze",
            type: "string",
            demandOption: true,
          }),
      handleAnalyze
    )
    .help()
    .showHelpOnFail(true)
    .parse();
}

type AssetWithInfo = {
  info?: {
    development?: boolean;
    immutable?: boolean;
  };
};

const fontName = "helvetica";
const white = "#F5F8FA";
const black = "#10161A";
const lightGray = "#EBF1F5";

// const blue = "#48AFF0";
const green = "#3DCC91";
// const orange = "#FFB366";
// const red = "#FF7373";

// const indigo = "#AD99FF";
// const cobalt = "#669EFF";
// const gold = "#FFC940";

async function handleAnalyze({
  statsFilePath,
  outputFilePath,
  outputFileType,
  openOnFinish,
}: {
  readonly verbose: boolean;
  readonly statsFilePath: string;
  readonly outputFilePath: string;
  readonly outputFileType: string;
  readonly openOnFinish: boolean;
}) {
  console.log(`loading stats file from ${statsFilePath}`);
  const rawStatsFile = await readFile(statsFilePath, "utf-8");
  const statsFile = JSON.parse(rawStatsFile) as Stats.ToJsonOutput;

  console.log(`analyzing stats`);

  const assets = chainFrom(statsFile.assets ?? [])
    .filter((asset) => !asset.name.endsWith(".LICENSE"))
    .filter((asset) => (asset as AssetWithInfo).info?.development !== true)
    .toArray();
  const assetByName = chainFrom(assets).toObject(
    (a) => a.name,
    (a) => a
  );
  const chunks = statsFile.chunks ?? [];

  const totalSize = chainFrom(assets)
    .map((asset) => asset.size)
    .sum();
  const totalAssets = assets.length;
  const totalChunks = chunks.length;

  // assets.forEach((asset) => console.log(asset));

  console.log(`total size: ${prettyBytes(totalSize)}`);
  console.log(`total assets: ${totalAssets}`);
  console.log(`total chunks: ${totalChunks}`);

  const graph = graphviz.digraph("G");
  graph.set("fontname", fontName);
  graph.set("fontcolor", black);
  graph.set("margin", 0);
  graph.set("pad", 0.3);
  graph.set("pad", 0.3);
  graph.set("bgcolor", lightGray);

  graph.setNodeAttribut("style", "filled");
  graph.setNodeAttribut("fontname", fontName);
  graph.setNodeAttribut("fontcolor", black);
  graph.setNodeAttribut("margin", "0.1,0.02");
  graph.setNodeAttribut("color", black);
  graph.setNodeAttribut("fillcolor", white);

  graph.setEdgeAttribut("fontname", fontName);
  graph.setEdgeAttribut("fontcolor", black);
  graph.setEdgeAttribut("color", black);
  graph.setEdgeAttribut("arrowsize", 0.7);

  // const finalNode = graph.addNode("final", { fillcolor: gold, label: "Final Task" });
  // const critNode = graph.addNode("crit", { fillcolor: red, label: "Critical Task" });
  // const aNode = graph.addNode("A", { fillcolor: green });
  // const bNode = graph.addNode("B");
  // const cNode = graph.addNode("C");

  // graph.addEdge(critNode.id, finalNode.id);
  // graph.addEdge(aNode.id, bNode.id);
  // graph.addEdge(bNode.id, cNode.id);
  // graph.addEdge(bNode.id, finalNode.id);
  // graph.addEdge(cNode.id, critNode.id, { label: "Important!" });

  // chunks.forEach((chunk) => {
  //   graph.addNode(chunk.id.toString());
  //   chunk.children.forEach((childChunkId) => graph.addEdge(childChunkId.toString(), chunk.id.toString()));
  // });

  const entryPointNames = Object.keys(statsFile.entrypoints ?? {});
  const chunkGroups = statsFile.namedChunkGroups ?? {};
  const chunkGroupsNames = Object.keys(chunkGroups);

  chainFrom(chunkGroupsNames)
    .map((chunkGroupName) => ({ chunkGroupName, ...chunkGroups[chunkGroupName] }))
    .filter(({ assets, children }) => assets.length > 0 || Object.keys(children).length > 0)
    .map(({ assets, ...rest }) => ({
      assets,
      ...rest,
      totalSize: chainFrom(assets)
        // if assets by name does not contain the asset, its a source map or a lisense file
        .map((a) => assetByName[a]?.size ?? 0)
        .sum(),
    }))
    .forEach(({ chunkGroupName, children, totalSize }) => {
      graph.addNode(chunkGroupName, {
        label: `${chunkGroupName} ${prettyBytes(totalSize)}`,
        fillcolor: entryPointNames.includes(chunkGroupName) ? green : undefined,
      });
      console.log(children.prefetch);
    });

  const outputFileName = outputFilePath.concat(".", outputFileType);
  const resolvedOutputFilePath = path.resolve(outputFileName);

  const renderedGraph = await new Promise((resolve, reject) =>
    graph.render(outputFileType, (data) => resolve(data), reject)
  );

  await writeFile(resolvedOutputFilePath, renderedGraph);

  if (openOnFinish) {
    await promisify(exec)(`open ${resolvedOutputFilePath}`);
  }
}
