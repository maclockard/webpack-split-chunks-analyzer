import { promises } from "fs";
import type { Compiler, NormalModule, Stats } from "webpack";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { chainFrom } from "transducist";
import * as R from "runtypes";
import ELK from "elkjs";
import type { ElkPrimitiveEdge, ElkNode } from "elkjs";
import prettyBytes from "pretty-bytes";
import cheerio from "cheerio";

import type { ChunkData, ChunkGroupEdgeData, ChunkGroupGraph, ChunkGroupNodeData } from "../sharedTypes";

const { writeFile, readFile } = promises;

export const SplitChunksAnalyzerOptions = R.Record({
  outputFile: R.String.optional(),
  openOnFinish: R.Boolean.optional(),
});

export type SplitChunksAnalyzerOptions = R.Static<typeof SplitChunksAnalyzerOptions>;

type RequiredOptions = Required<SplitChunksAnalyzerOptions>;

const DEFAULT_OPTIONS: RequiredOptions = {
  outputFile: "split-chunks-report.html",
  openOnFinish: false,
};

export class SplitChunksAnalyzerPlugin {
  private options: RequiredOptions;
  private compiler: Compiler | undefined = undefined;
  private elk = new ELK();

  public constructor(userOptions: SplitChunksAnalyzerOptions = {}) {
    SplitChunksAnalyzerOptions.check(userOptions);
    this.options = { ...DEFAULT_OPTIONS, ...userOptions };
  }

  public apply(compiler: Compiler) {
    this.compiler = compiler;
    compiler.hooks.done.tapPromise("SplitChunksAnalyzerPlugin", this.analyze);
  }

  private analyze = async (stats: Stats): Promise<void> => {
    if (!this.compiler) {
      throw new Error("did not call apply before trying to analyze");
    }

    // the included webpack types are a bit lacking so we cast
    const compilation = stats.compilation;

    const nodeDataIndex: Record<string, ChunkGroupNodeData> = {};
    const edgeDataIndex: Record<string, ChunkGroupEdgeData> = {};
    const elkGraph: ElkNode & { children: ElkNode[]; edges: ElkPrimitiveEdge[] } = {
      layoutOptions: {
        "elk.algorithm": "org.eclipse.elk.mrtree",
        "org.eclipse.elk.direction": "DOWN",
      },
      id: "root",
      children: [],
      edges: [],
    };

    const prodAssetsIds = chainFrom(Object.keys(compilation.assets))
      .filter((id) => !id.endsWith(".LICENSE"))
      .filter((id) => compilation.assetsInfo.get(id)?.development !== true)
      .toSet();

    const chunkGroups = compilation.chunkGroups;
    const entrypointIds = Array.from(compilation.entrypoints.keys());

    let edgeIdCounter = 0;

    chainFrom(chunkGroups)
      .filter((chunkGroup) => chunkGroup.chunks.length > 0 || chunkGroup.getChildren().length > 0)
      .forEach((chunkGroup) => {
        const splitOriginFileName = chunkGroup.origins[0]?.request.split("/");
        const originName = splitOriginFileName?.[splitOriginFileName.length - 1];

        const chunkGroupSize = chainFrom(chunkGroup.getFiles())
          .filter((id) => prodAssetsIds.has(id))
          .map((id) => compilation.assets[id])
          .map((asset) => asset.size())
          .sum();

        const chunks = chainFrom(chunkGroup.chunks)
          .map<ChunkData>((chunk) => {
            const chunkSize = chunk.size();

            const modules = chainFrom(chunk.getModules())
              .map((mod) => {
                const moduleName =
                  typeof (mod as NormalModule).userRequest === "string"
                    ? (mod as NormalModule).userRequest
                    : // TODO make this a real name
                      "<unknown>";
                const moduleSize = mod.size();

                return {
                  name: moduleName,
                  size: moduleSize,
                  displaySize: prettyBytes(moduleSize),
                };
              })
              .toArray()
              .sort((a, b) => b.size - a.size);

            return {
              name: chunk.files.values().next().value as string,
              size: chunkSize,
              displaySize: prettyBytes(chunkSize),
              modules,
            };
          })
          .filter((chunk) => prodAssetsIds.has(chunk.name))
          .toArray()
          .sort((a, b) => b.size - a.size);

        const name = chunkGroup.name ?? originName ?? chunkGroup.id;

        const displaySize = prettyBytes(chunkGroupSize);

        nodeDataIndex[chunkGroup.id] = {
          label: `${name} (${displaySize})`,
          name,
          size: chunkGroupSize,
          displaySize,
          entryPoint: entrypointIds.includes(chunkGroup.id),
          chunks,
        };
        elkGraph.children.push({
          id: chunkGroup.id,
          width: 170,
          height: 55,
        });

        const childOrders = chainFrom(
          Object.entries(chunkGroup.getChildrenByOrders(stats.compilation.moduleGraph, stats.compilation.chunkGraph))
        )
          .map<[string, Set<string>]>(([orderType, groups]) => [orderType, new Set(groups.map((group) => group.id))])
          .toObject(
            ([orderType, _]) => orderType,
            ([_, groups]) => groups
          );

        chunkGroup.getChildren().forEach((child) => {
          if (child.chunks.length > 0 || child.getChildren().length > 0) {
            const isPrefetched = childOrders.prefetch?.has(child.id) ?? false;
            const isPreloaded = childOrders.preload?.has(child.id) ?? false;
            const edgeId = (edgeIdCounter++).toString();

            elkGraph.edges.push({
              id: edgeId,
              source: chunkGroup.id,
              target: child.id,
            });

            edgeDataIndex[edgeId] = {
              kind: isPrefetched ? "prefetch" : isPreloaded ? "preload" : undefined,
            };
          }
        });
      });

    const elkGraphResult = await this.elk.layout(elkGraph);

    const graph: ChunkGroupGraph = {
      buildName: stats.compilation.name ?? stats.hash ?? "<unknown>",
      nodes: {},
      edges: [],
    };

    for (const elkNode of elkGraphResult.children ?? []) {
      graph.nodes[elkNode.id] = {
        id: elkNode.id,
        position: {
          x: elkNode.x ?? 0,
          y: elkNode.y ?? 0,
        },
        data: nodeDataIndex[elkNode.id],
      };
    }

    for (const elkEdge of (elkGraphResult.edges as ElkPrimitiveEdge[] | undefined) ?? []) {
      graph.edges.push({
        id: elkEdge.id,
        source: elkEdge.source,
        target: elkEdge.target,
        data: edgeDataIndex[elkEdge.id],
      });
    }

    const outputFilePath = path.resolve(this.compiler.outputPath, this.options.outputFile);

    const html = await readFile(path.resolve(__dirname, "../../dist/index.html"));

    const $ = cheerio.load(html);

    $("head").append(`<script type="application/json" id="data">${JSON.stringify(graph)}</script>`);

    await writeFile(outputFilePath, $.html());

    if (this.options.openOnFinish) {
      await promisify(exec)(`open ${outputFilePath}`);
    }
  };
}
