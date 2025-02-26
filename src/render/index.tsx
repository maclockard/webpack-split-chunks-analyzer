import React from "react";
import { createRoot } from "react-dom/client";
import { Graph } from "./Graph";

document.addEventListener("DOMContentLoaded", () => {
  const dataElement = document.getElementById("data");
  if (dataElement == null) {
    throw new Error("Missing webpack data");
  }

  const data = JSON.parse(dataElement.innerHTML);

  const rootElement = document.getElementById("root");
  if (rootElement == null) {
    throw new Error("Missing root element");
  }

  const reactRoot = createRoot(rootElement);
  reactRoot.render(<Graph graph={data} />);
});
