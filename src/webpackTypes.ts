export interface TypedCompilation {
  assets: Record<string, TypedAsset>;
  assetsInfo: Map<string, TypedAssetInfo>;
  chunks: Array<TypedChunk>;
  chunkGroups: Array<TypedChunkGroup>;
  entrypoints: Map<string, any>;
  namedChunkGroups: Map<string, TypedChunkGroup>;
}

export interface TypedAsset {
  emitted: boolean;
  size: () => number;
  info?: {
    development?: boolean;
    immutable?: boolean;
  };
}

export interface TypedAssetInfo {
  development?: boolean;
  immutable?: boolean;
}

export interface TypedChunk {
  id: number;
  name?: string | null;
  files: Array<string>; // asset names
}

type OrderType = "prefetch" | "preload";

export interface TypedChunkGroup {
  chunks: Array<TypedChunk>;
  name?: string | null;
  id: string;
  isOverSizeLimit: boolean;
  getChildren: () => Array<TypedChunkGroup>;
  getChildrenByOrders: () => Record<OrderType, Array<TypedChunkGroup>>;
  getParents: () => Array<TypedChunkGroup>;
  getFiles: () => string[]; // asset names
}
