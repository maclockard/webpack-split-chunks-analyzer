import React from "react";
import ReactFlow, { MiniMap, Controls, Background, BackgroundVariant } from "react-flow-renderer";
import type { ChunkGroupGraph } from "../sharedTypes";

export interface GraphProps {
  graph: ChunkGroupGraph;
}

export const Graph: React.ComponentType<GraphProps> = React.memo(function Graph({ graph }: GraphProps) {
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <ReactFlow
        defaultNodes={Object.values(graph.nodes)}
        defaultEdges={graph.edges}
        fitView={true}
        snapToGrid={true}
        nodesConnectable={false}
        deleteKeyCode=""
        onNodeClick={(_evt, node) => {
          console.log({ node });
        }}
      >
        <Background variant={BackgroundVariant.Lines} gap={30} size={1} />
        <MiniMap />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
});
