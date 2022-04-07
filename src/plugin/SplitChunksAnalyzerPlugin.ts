import { promises } from "fs";
import type { Compiler, Stats } from "webpack";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import prettyBytes from "pretty-bytes";
import { chainFrom } from "transducist";
import * as R from "runtypes";

const { writeFile } = promises;

export const SplitChunksAnalyzerOptions = R.Record({
  outputFileName: R.String.optional(),
  openOnFinish: R.Boolean.optional(),
});

export type SplitChunksAnalyzerOptions = R.Static<typeof SplitChunksAnalyzerOptions>;

type RequiredOptions = Required<SplitChunksAnalyzerOptions>;

const DEFAULT_OPTIONS: RequiredOptions = {
  outputFileName: "split-chunks-report",
  openOnFinish: true,
};

export class SplitChunksAnalyzerPlugin {
  private options: RequiredOptions;
  private compiler: Compiler | undefined = undefined;

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

    const graph: Gra = createPrettyGraph();

    const prodAssetsIds = chainFrom(Object.keys(compilation.assets))
      .filter((id) => !id.endsWith(".LICENSE"))
      .filter((id) => compilation.assetsInfo.get(id)?.development !== true)
      .toSet();

    const chunkGroups = compilation.chunkGroups;
    const entrypointIds = Array.from(compilation.entrypoints.keys());

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

        graph.addNode(chunkGroup.id, {
          label: `${chunkGroup.name ?? originName ?? chunkGroup.id} ${prettyBytes(chunkGroupSize)}`,
          fillcolor: entrypointIds.includes(chunkGroup.id) ? GraphColors.GREEN : undefined,
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
            graph.addEdge(chunkGroup.id, child.id, {
              color: isPrefetched ? GraphColors.BLUE : isPreloaded ? GraphColors.ORANGE : GraphColors.BLACK,
              style: isPrefetched || isPreloaded ? "dashed" : "solid",
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
