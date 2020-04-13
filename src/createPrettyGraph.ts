import graphviz from "graphviz";

// These colors from from https://blueprintjs.com/docs/versions/2/#core/colors
export enum GraphColors {
  WHITE = "#F5F8FA",
  BLACK = "#10161A",
  LIGHT_GRAY = "#EBF1F5",

  BLUE = "#48AFF0",
  GREEN = "#3DCC91",
  ORANGE = "#FFB366",
  RED = "#FF7373",

  INDIGO = "#AD99FF",
  COBALT = "#669EFF",
  GOLD = "#FFC940",
}

const FONT_NAME = "helvetica";

export function createPrettyGraph() {
  const graph = graphviz.digraph("G");
  graph.set("fontname", FONT_NAME);
  graph.set("fontcolor", GraphColors.BLACK);
  graph.set("margin", 0);
  graph.set("pad", 0.3);
  graph.set("pad", 0.3);
  graph.set("bgcolor", GraphColors.LIGHT_GRAY);

  graph.setNodeAttribut("style", "filled");
  graph.setNodeAttribut("fontname", FONT_NAME);
  graph.setNodeAttribut("fontcolor", GraphColors.BLACK);
  graph.setNodeAttribut("margin", "0.1,0.02");
  graph.setNodeAttribut("color", GraphColors.BLACK);
  graph.setNodeAttribut("fillcolor", GraphColors.WHITE);

  graph.setEdgeAttribut("fontname", FONT_NAME);
  graph.setEdgeAttribut("fontcolor", GraphColors.BLACK);
  graph.setEdgeAttribut("color", GraphColors.BLACK);
  graph.setEdgeAttribut("arrowsize", 0.7);

  return graph;
}
