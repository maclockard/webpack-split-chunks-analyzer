import type { Node, Edge } from "@xyflow/react";

export interface ModuleData {
  name: string;
  size: number;
  displaySize: string;
}

export interface ChunkData {
  name: string;
  size: number;
  displaySize: string;
  modules: ModuleData[];
}

export interface ChunkGroupNodeData {
  label: string;
  name: string;
  size: number;
  displaySize: string;
  entryPoint: boolean;
  chunks: ChunkData[];
  [key: string]: unknown;
}

export type ChunkGroupEdgeKind = "prefetch" | "preload";

export interface ChunkGroupEdgeData {
  kind?: ChunkGroupEdgeKind;
  [key: string]: unknown;
}

export interface ChunkGroupGraph {
  buildName: string;
  nodes: {
    [nodeId: string]: Node<ChunkGroupNodeData>;
  };
  edges: Edge<ChunkGroupEdgeData>[];
}
