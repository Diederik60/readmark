// PDF viewer entry. pdf.js and pdf-lib are large, so the implementation is
// loaded on first use; Markdown-only sessions never load them.

class LazyPdfViewer {
  async mount(container, path, ctx) {
    const { PdfDocumentViewer } = await import("./viewer.js");
    this.impl = new PdfDocumentViewer();
    await this.impl.mount(container, path, ctx);
  }
  reload() {
    return this.impl?.reload();
  }
  unmount() {
    this.impl?.unmount();
  }
  isDirty() {
    return this.impl?.isDirty() ?? false;
  }
  save() {
    return this.impl?.save() ?? Promise.resolve(false);
  }
  saveAs() {
    return this.impl?.saveAs() ?? Promise.resolve(false);
  }
  command(name) {
    return this.impl?.command(name) ?? false;
  }
}

export const pdfViewer = {
  id: "pdf",
  label: "PDF",
  extensions: ["pdf"],
  create: () => new LazyPdfViewer(),
};
