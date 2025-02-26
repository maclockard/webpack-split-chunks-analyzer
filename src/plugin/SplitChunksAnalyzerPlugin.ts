import { promises } from "node:fs";
import type { Compiler, NormalModule, Stats } from "webpack";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { chainFrom } from "transducist";
import Dagre from '@dagrejs/dagre';
import prettyBytes from "pretty-bytes";
import * as cheerio from 'cheerio';

import type { ChunkData, ChunkGroupEdgeData, ChunkGroupGraph, ChunkGroupNodeData } from "../sharedTypes";


const { writeFile, readFile } = promises;

export interface SplitChunksAnalyzerOptions {
  outputFile?: string | string[],
  openOnFinish?: boolean,
};

type RequiredOptions = Required<SplitChunksAnalyzerOptions>;

const DEFAULT_OPTIONS: RequiredOptions = {
  outputFile: "split-chunks-report.html",
  openOnFinish: false,
};

export class SplitChunksAnalyzerPlugin {
  private options: RequiredOptions;
  private compiler: Compiler | undefined = undefined;

  public constructor(userOptions: SplitChunksAnalyzerOptions = {}) {
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

    const dagreGraph = new Dagre.graphlib.Graph();

    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: "TB" })

    const graph: ChunkGroupGraph = {
      buildName: stats.compilation.name ?? stats.hash ?? "<unknown>",
      nodes: {},
      edges: [],
    };

    let edgeIdCounter = 0;

    const prodAssetsIds = chainFrom(Object.keys(compilation.assets))
      .filter((id) => !id.endsWith(".LICENSE"))
      .filter((id) => compilation.assetsInfo.get(id)?.development !== true)
      .toSet();

    const chunkGroups = compilation.chunkGroups;
    const entrypointIds = Array.from(compilation.entrypoints.keys());

    chainFrom(chunkGroups)
      .filter((chunkGroup) => chunkGroup.chunks.length > 0 || chunkGroup.getChildren().length > 0)
      .forEach((chunkGroup) => {
        const splitOriginFileName = chunkGroup.origins[0]?.request?.split("/");
        const originName = splitOriginFileName?.[splitOriginFileName.length - 1];

        const chunkGroupSize = chainFrom(chunkGroup.getFiles())
          .filter((id) => prodAssetsIds.has(id))
          .map((id) => compilation.assets[id])
          .map((asset) => asset.size())
          .sum();

        const chunks = chainFrom(chunkGroup.chunks)
          .map<ChunkData>((chunk) => {
            const file = Array.from(chunk.files)[0];

            const chunkSize = compilation.assets[file].size();

            const modules = chainFrom(chunk.getModules())
              .map((mod) => {
                const moduleName =
                  typeof (mod as NormalModule).userRequest === "string"
                    ? path.relative(compilation.compiler.context, (mod as NormalModule).userRequest)
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
              name: file,
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

        dagreGraph.setNode(chunkGroup.id, {width: 170, height: 55});

      graph.nodes[chunkGroup.id] = {
        id: chunkGroup.id,
        position: {
          x: 0,
          y: 0,
        },
        data: {
          label: `${name} (${displaySize})`,
          name,
          size: chunkGroupSize,
          displaySize,
          entryPoint: entrypointIds.includes(chunkGroup.id),
          chunks,
        } satisfies ChunkGroupNodeData,
      };

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

            dagreGraph.setEdge(chunkGroup.id, child.id)
            graph.edges.push({
              id: (edgeIdCounter++).toString(),
              source: chunkGroup.id,
              target: child.id,
              data: {
                kind: isPrefetched ? "prefetch" : isPreloaded ? "preload" : undefined,
              } satisfies ChunkGroupEdgeData,})
          }
        });
      });

    Dagre.layout(dagreGraph);

    for (const node of Object.values(graph.nodes)) {
      const position = dagreGraph.node(node.id);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;

      node.position = {
        x,
        y
      }
    }
    const baseHtml = await readFile(path.resolve(__dirname, "../../dist/index.html"));

    let lastPath: string | undefined = undefined;

    const outputFiles = Array.isArray(this.options.outputFile) ? this.options.outputFile : [this.options.outputFile];
    for (const outputFile of outputFiles) {
      const outputFilePath = path.resolve(this.compiler.outputPath, outputFile);

      const $ = cheerio.load(baseHtml);

      $("head").append(`<script type="application/json" id="data">${JSON.stringify(graph)}</script>`);

      await writeFile(outputFilePath, $.html());
      lastPath = outputFilePath;
    }


    if (this.options.openOnFinish && lastPath != null) {
      await promisify(exec)(`open ${lastPath}`);
    }
  };
}
