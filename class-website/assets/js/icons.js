const paths = {
  home: ["M3 10.5 12 3l9 7.5", "M5.5 9.5V21h13V9.5", "M9.5 21v-7h5v7"],
  class: ["M4 3.5h13l3 3V20H4z", "M17 3.5V7h3", "M7.5 10h9", "M7.5 13.5h9", "M7.5 17h6"],
  schedule: ["M4 5.5h16v15H4z", "M8 3v5", "M16 3v5", "M4 9.5h16", "M8 13h3", "M8 16.5h3"],
  moments: ["M3.5 5.5h17v15h-17z", "m4 17 5-5 4 4 3-3 4 4", "M8 9h.01"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  wheel: ["M12 3v18", "M3 12h18", "m5.64 5.64 12.72 12.72", "M18.36 5.64 5.64 18.36", "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7"],
  report: ["M5 3.5h14v17H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
  close: ["m6 6 12 12", "M18 6 6 18"],
  arrowLeft: ["M19 12H5", "m12 19-7-7 7-7"],
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8", "M12 2v2", "M12 20v2", "m4.93 4.93 1.42 1.42", "m17.65 17.65 1.42 1.42", "M2 12h2", "M20 12h2", "m4.93 19.07 1.42-1.42", "m17.65 6.35 1.42-1.42"],
  moon: ["M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z"],
  heart: ["M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6z"],
};

export function createIcon(name, { className = "", decorative = true } = {}) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (className) svg.setAttribute("class", className);
  if (decorative) svg.setAttribute("aria-hidden", "true");
  else svg.setAttribute("focusable", "false");
  for (const definition of paths[name] ?? paths.more) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", definition);
    svg.append(path);
  }
  return svg;
}
