import { extractPdfText } from "./pdf.js";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "c",
  "h",
  "cpp",
  "hpp",
  "py",
  "java",
  "rs",
  "go",
  "sh",
]);

export async function extractStudyMaterial(file) {
  const extension = getExtension(file.name);

  if (file.type === "application/pdf" || extension === "pdf") {
    const extracted = await extractPdfText(file);
    return {
      kind: "pdf",
      pages: extracted.pages,
      text: extracted.text,
      chars: extracted.chars,
      previewUrl: null,
      note: "",
    };
  }

  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    const text = await file.text();
    return {
      kind: "text",
      pages: 0,
      text,
      chars: text.length,
      previewUrl: null,
      note: "",
    };
  }

  if (file.type.startsWith("image/")) {
    const previewUrl = await readAsDataUrl(file);
    return {
      kind: "image",
      pages: 0,
      text: `[Image: ${file.name}]`,
      chars: 0,
      previewUrl,
      note: "",
    };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

function getExtension(name) {
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
