import React from "react";

import type { ChunkGroupNodeData } from "../sharedTypes";

export interface NodeSummaryProps {
  data?: ChunkGroupNodeData;
}

export const NodeSummary: React.ComponentType<NodeSummaryProps> = React.memo(function NodeSummary({
  data,
}: NodeSummaryProps) {
  console.log(data);
  return (
    <div
      style={{
        width: "450px",
        overflow: "auto",
        flex: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        padding: "10px",
      }}
    >
      {data == null && "Select a node to see size info"}
      {data != null && (
        <ul>
          {data.chunks.map((chunk) => (
            <li key={chunk.name}>
              {chunk.displaySize} - {chunk.name}
              <ul>
                <li>
                  {chunk.modules.map((mod) => (
                    <li key={mod.name}>
                      {mod.displaySize} - {mod.name}
                    </li>
                  ))}
                </li>
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
