// viewer.js  —— 完整最终版（支持 PDF & EPUB）
import { getDocument, GlobalWorkerOptions } from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs";

const books = [
  { file: "A.pdf",    title: "A Systematic Review of Compressive Sensing: Concepts, Implementations and Applications" },
  { file: "b.pdf",    title: "编程珠玑" },
  { file: "chan.pdf", title: "禅与摩托车维修艺术" },
  { file: "C.pdf",    title: "Compact Data Structures: A Practical Approach" },
  { file: "S.pdf",    title: "The shellcoder's handbook" },
  // { file: "rust-book.epub", title: "The Rust Programming Language" },
];

const bookGrid = document.getElementById("bookGrid");
const viewerModal = document.getElementById("viewerModal");
const viewer = document.getElementById("viewer");
const bookTitleEl = document.getElementById("bookTitle");
const closeBtn = document.getElementById("closeBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");

let currentReader = null;  // pdfDoc 或 epub rendition

async function generatePDFThumbnail(file) {
  try {
    const loadingTask = pdfjsLib.getDocument(`books/${file}`);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const scale = 1.0;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("PDF 缩略图生成失败，回退占位图", file);
    return null;
  }
}

books.forEach(async (book) => {
  const div = document.createElement("div");
  div.className = "book-card";

  const isPDF = book.file.toLowerCase().endsWith(".pdf");

  const img = document.createElement("img");
  img.className = "book-cover";
  img.loading = "lazy";
  img.alt = book.title;

  if (isPDF) {
    img.src = "https://via.placeholder.com/300x420/f8f9fa/0066cc?text=PDF";
  } else {
    img.src = "https://via.placeholder.com/300x420/f3f2ff/6666cc?text=EPUB";
  }

  if (isPDF) {
    const realThumb = await generatePDFThumbnail(book.file);
    if (realThumb) {
      img.src = realThumb;         // 成功就替换
      img.style.background = "#fff";
    }
  }

  const titleEl = document.createElement("div");
  titleEl.className = "book-title";
  titleEl.innerHTML = `${book.title}<br><small style="color:#888;">${isPDF ? 'PDF' : 'EPUB'}</small>`;

  div.appendChild(img);
  div.appendChild(titleEl);
  div.onclick = () => openBook(book);
  bookGrid.appendChild(div);
});

// =====================================================
// 2. 统一打开函数
async function openBook(book) {
  bookTitleEl.textContent = book.title;
  viewer.innerHTML = "<div style='color:#aaa;padding:3rem;text-align:center;'>加载中…</div>";
  viewerModal.classList.add("active");

  if (book.file.toLowerCase().endsWith(".pdf")) {
    openPDF(book);
  } else if (book.file.toLowerCase().endsWith(".epub")) {
    openEPUB(book);
  } else {
    alert("不支持的文件格式");
    viewerModal.classList.remove("active");
  }
}

// —— PDF 渲染部分（保持之前的高性能实现）——
let pdfDoc = null, pageNum = 1, pageRendering = false, pageNumPending = null, scale = 1.5;

function openPDF(book) {
  currentReader = "pdf";
  const loadingTask = getDocument(`books/${book.file}`);
  loadingTask.promise.then(pdf => {
    pdfDoc = pdf;
    pageNum = 1;
    renderPage(1);
  }).catch(err => {
    viewer.innerHTML = `<div style='color:#faa;padding:3rem;'>加载失败：${err.message}</div>`;
  });
}

function renderPage(num) {
  pageRendering = true;
  pdfDoc.getPage(num).then(page => {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const ctx = canvas.getContext("2d");

    viewer.innerHTML = "";
    viewer.appendChild(canvas);

    page.render({ canvasContext: ctx, viewport }).promise.then(() => {
      pageRendering = false;
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });

  pageInfo.textContent = `第 ${num} / ${pdfDoc.numPages} 页`;
  prevBtn.disabled = num <= 1;
  nextBtn.disabled = num >= pdfDoc.numPages;
}

function queueRenderPage(num) {
  if (pageRendering) pageNumPending = num;
  else renderPage(num);
}

// —— EPUB 渲染部分（epub.js）——
let epubRendition = null;

function openEPUB(book) {
  currentReader = "epub";
  // 清理旧的
  if (epubRendition) epubRendition.destroy();

  const epubBook = ePub(`books/${book.file}`);
  epubRendition = epubBook.renderTo("viewer", {
    width: "100%",
    height: "100%",
    spread: "always",      // 双页模式（大屏好看）
    flow: "paginated"
  });

  epubRendition.display();

  // 监听位置变化，实时更新页码信息
  epubRendition.on("relocated", location => {
    const percent = (location.start.index / epubBook.spine.length * 100).toFixed(1);
    pageInfo.textContent = `${location.start.location} · ${percent}%`;
  });

  // 初始页码
  pageInfo.textContent = "加载中…";
  prevBtn.disabled = false;
  nextBtn.disabled = false;
}

// 统一翻页按钮
prevBtn.onclick = () => {
  if (currentReader === "pdf") {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
  } else if (currentReader === "epub") {
    epubRendition.prev();
  }
};

nextBtn.onclick = () => {
  if (currentReader === "pdf") {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
  } else if (currentReader === "epub") {
    epubRendition.next();
  }
};

// 关闭
closeBtn.onclick = () => {
  viewerModal.classList.remove("active");
  viewer.innerHTML = "";
  if (currentReader === "epub" && epubRendition) {
    epubRendition.destroy();
    epubRendition = null;
  }
  currentReader = null;
  pdfDoc = null;
};

// 键盘 + 触控支持
document.addEventListener("keydown", e => {
  if (!viewerModal.classList.contains("active")) return;
  if (e.key === "ArrowLeft") prevBtn.click();
  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "Escape") closeBtn.click();
});
