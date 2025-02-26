import React, { useCallback, useMemo, useState } from "react";
import { ReactFlow, MiniMap, Controls, Background, BackgroundVariant, NodeMouseHandler } from "@xyflow/react";
import type { ChunkGroupGraph, ChunkGroupNodeData } from "../sharedTypes";
import { NodeSummary } from "./NodeSummary";

export interface GraphProps {
  graph: ChunkGroupGraph;
}

export const Graph: React.ComponentType<GraphProps> = React.memo(function Graph({ graph }: GraphProps) {
  const nodes = useMemo(() => Object.values(graph.nodes), [graph.nodes]);

  const [nodeData, setNodeData] = useState<ChunkGroupNodeData>();

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node: ChunkGroupGraph["nodes"][string]) => {
    setNodeData(node.data);
  }, []);

  return (
    <div style={{ height: "100%", width: "100%", display: "flex" }}>
      <div style={{ flex: "auto" }}>
        <ReactFlow
          defaultNodes={nodes}
          defaultEdges={graph.edges}
          fitView={true}
          snapToGrid={true}
          nodesConnectable={false}
          deleteKeyCode=""
          onNodeClick={onNodeClick}
        >
          <Background variant={BackgroundVariant.Lines} gap={30} size={1} />
          <MiniMap />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <NodeSummary data={nodeData} />
    </div>
  );
});
