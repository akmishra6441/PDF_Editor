
document.addEventListener('DOMContentLoaded', () => {

    
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
    } else {
        console.error("pdf.js library not loaded.");
        return;
    }

    
    const pdfUpload = document.getElementById('pdf-upload');
    const fileNameSpan = document.getElementById('file-name');
    const pdfViewer = document.getElementById('pdf-viewer');
    const downloadBtn = document.getElementById('download-btn');
    const statusContainer = document.getElementById('status-container');
    const statusText = document.getElementById('status-text');

    
    let originalPdfFile = null; 
    let textElements = []; 

    
    pdfUpload.addEventListener('change', handleFileSelect);
    downloadBtn.addEventListener('click', savePdfWithBackend);

    
    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }

        originalPdfFile = file; 
        fileNameSpan.textContent = file.name;
        pdfViewer.innerHTML = '';
        textElements = [];
        downloadBtn.disabled = true;

        showStatus('Loading PDF...');

        try {
            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
                const pdfData = new Uint8Array(e.target.result);
                const loadingTask = pdfjsLib.getDocument(pdfData);
                const pdf = await loadingTask.promise;
                
                showStatus(`Rendering ${pdf.numPages} pages...`);
                for (let i = 1; i <= pdf.numPages; i++) {
                    await renderPage(pdf, i);
                }
                
                hideStatus();
                downloadBtn.disabled = false;
            };
            fileReader.readAsArrayBuffer(file);
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Failed to load or render PDF.');
            hideStatus();
        }
    }

   
    async function renderPage(pdf, pageNum) {
        const page = await pdf.getPage(pageNum);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'text-layer';

        pageContainer.append(canvas, textLayerDiv);
        pdfViewer.appendChild(pageContainer);

        await page.render({ canvasContext: context, viewport }).promise;

        const textContent = await page.getTextContent();
        
        textContent.items.forEach((item) => {
            if (!item.str.trim()) return;

            const div = document.createElement('div');
            div.textContent = item.str;
            
            const style = div.style;
            const transform = item.transform;
            const viewport_clone = viewport.clone({ dontFlip: true });
            const [fontSize, , , , x, y] = pdfjsLib.Util.transform(viewport_clone.transform, transform);

            style.left = `${x}px`;
            style.top = `${y}px`;
            style.fontSize = `${fontSize}px`;
            style.height = `${item.height}px`;
            style.width = `${item.width}px`;
            
            div.setAttribute('contenteditable', 'true');
            textLayerDiv.appendChild(div);

            
            textElements.push({
                element: div,
                originalText: item.str,
                pageIndex: pageNum - 1,
                rect: { x, y, width: item.width, height: item.height },
                fontSize: fontSize,
            });
        });
    }

    
    async function savePdfWithBackend() {
        if (!originalPdfFile) {
            alert('No PDF loaded.');
            return;
        }

        showStatus('Applying changes with backend...');
        downloadBtn.disabled = true;

        
        const edits = textElements
            .filter(elem => elem.element.textContent !== elem.originalText)
            .map(elem => ({
                pageIndex: elem.pageIndex,
                newText: elem.element.textContent,
                rect: elem.rect,
                fontSize: elem.fontSize,
            }));

        if (edits.length === 0) {
            alert("No changes were made to the text.");
            hideStatus();
            downloadBtn.disabled = false;
            return;
        }

        
        const formData = new FormData();
        formData.append('pdf', originalPdfFile);
        formData.append('edits', JSON.stringify(edits));

        try {
            
            const response = await fetch('http://127.0.0.1:5000/edit-pdf', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend error: ${response.status} ${errorText}`);
            }

            
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `edited-${fileNameSpan.textContent}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Error saving PDF with backend:', error);
            alert(`Failed to save PDF. Ensure the Python backend is running. \nError: ${error.message}`);
        } finally {
            hideStatus();
            downloadBtn.disabled = false;
        }
    }

    
    function showStatus(text) {
        statusText.textContent = text;
        statusContainer.style.display = 'block';
    }

    function hideStatus() {
        statusContainer.style.display = 'none';
    }
});
