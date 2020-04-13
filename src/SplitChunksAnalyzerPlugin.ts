import { promises } from "fs";
import { Plugin, Compiler, Stats } from "webpack";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import prettyBytes from "pretty-bytes";
import { createPrettyGraph, GraphColors } from "./createPrettyGraph";
import { TypedCompilation } from "./webpackTypes";
import { chainFrom } from "transducist";
const { writeFile } = promises;

export interface SplitChunksAnalyzerOptions {
  readonly outputFileType?: "pdf" | "png" | "dot" | "jpg" | "jpeg" | "gv";
  readonly outputFileName?: string;
  readonly openOnFinish?: boolean;
}

type RequiredOptions = Required<SplitChunksAnalyzerOptions>;

const DEFAULT_OPTIONS: RequiredOptions = {
  outputFileType: "pdf",
  outputFileName: "split-chunks-report",
  openOnFinish: true,
};

export class SplitChunksAnalyzerPlugin implements Plugin {
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

    // the included webpack types are a bit lacking
    const compilation = (stats.compilation as unknown) as TypedCompilation;

    const graph = createPrettyGraph();

    const prodAssetsIds = chainFrom(Object.keys(compilation.assets))
      .filter((id) => !id.endsWith(".LICENSE"))
      .filter((id) => compilation.assetsInfo.get(id)?.development !== true)
      .toArray();

    const chunkGroups = compilation.chunkGroups;
    const entrypointNames = Array.from(compilation.entrypoints.keys());

    chainFrom(chunkGroups)
      .filter((chunkGroup) => chunkGroup.chunks.length > 0 || chunkGroup.getChildren().length > 0)
      .forEach((chunkGroup) => {
        const resolvedName = chunkGroup.name ?? chunkGroup.id;
        const chunkGroupSize = chainFrom(chunkGroup.getFiles())
          .filter((id) => prodAssetsIds.includes(id))
          .map((id) => compilation.assets[id])
          .map((asset) => asset.size())
          .sum();

        graph.addNode(resolvedName, {
          label: `${resolvedName} ${prettyBytes(chunkGroupSize)}`,
          fillcolor: entrypointNames.includes(resolvedName) ? GraphColors.GREEN : undefined,
        });

        const childOrders = chainFrom(Object.entries(chunkGroup.getChildrenByOrders()))
          .map<[string, string[]]>(([orderType, groups]) => [orderType, groups.map((group) => group.name ?? group.id)])
          .toObject(
            ([orderType, _]) => orderType,
            ([_, groups]) => groups
          );

        chunkGroup.getChildren().forEach((child) => {
          if (child.chunks.length > 0 || child.getChildren().length > 0) {
            const isPrefetched = childOrders.prefetch?.includes(child.name ?? child.id) ?? false;
            const isPreloaded = childOrders.preload?.includes(child.name ?? child.id) ?? false;
            graph.addEdge(resolvedName, child.name ?? child.id, {
              color: isPrefetched ? GraphColors.BLUE : isPreloaded ? GraphColors.ORANGE : undefined,
              style: isPrefetched || isPreloaded ? "dashed" : undefined,
            });
          }
        });
      });

    const renderedGraph = await new Promise((resolve, reject) =>
      graph.render(this.options.outputFileType, (data) => resolve(data), reject)
    );

    const outputFilePath = path.resolve(
      this.compiler.outputPath,
      this.options.outputFileName.concat(".", this.options.outputFileType)
    );
    await writeFile(outputFilePath, renderedGraph);

    if (this.options.openOnFinish) {
      await promisify(exec)(`open ${outputFilePath}`);
    }
  };
}
