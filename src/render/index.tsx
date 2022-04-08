import React from "react";
import { render } from "react-dom";
import { Graph } from "./Graph";

document.addEventListener("DOMContentLoaded", () => {
  const dataElement = document.getElementById("data");
  if (dataElement == null) {
    throw new Error("Missing webpack data");
  }

  const data = JSON.parse(dataElement.innerHTML);

  render(<Graph graph={data} />, document.getElementById("root"));
});
