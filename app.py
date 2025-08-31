import fitz  
from flask import Flask, request, send_file
from flask_cors import CORS
import json
import io


app = Flask(__name__)

CORS(app)

@app.route('/edit-pdf', methods=['POST'])
def edit_pdf():
    """
    API endpoint to edit a PDF file.
    Expects a POST request with a 'pdf' file and 'edits' data.
    """
    
    if 'pdf' not in request.files:
        return "No PDF file provided", 400

    
    if 'edits' not in request.form:
        return "No edits data provided", 400

    pdf_file = request.files['pdf']
    edits_json = request.form['edits']
    
    try:
       
        edits = json.loads(edits_json)
    except json.JSONDecodeError:
        return "Invalid JSON format for edits", 400

    
    pdf_bytes = pdf_file.read()
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")

    
    for edit in edits:
        try:
            page_index = int(edit['pageIndex'])
            new_text = edit['newText']
            
            rect_coords = edit['rect'] 
            
            
            if 0 <= page_index < len(pdf_document):
                page = pdf_document[page_index]
                
                
                rect = fitz.Rect(rect_coords['x'], rect_coords['y'], rect_coords['x'] + rect_coords['width'], rect_coords['y'] + rect_coords['height'])

               
                redaction = page.add_redact_annot(rect, fill=(1, 1, 1)) 
                page.apply_redactions()

                
                font_size = edit.get('fontSize', 10) 
                page.insert_textbox(rect, new_text, fontsize=font_size, fontname="helv", color=(0, 0, 0))

        except (KeyError, ValueError, TypeError) as e:
            print(f"Skipping invalid edit object: {edit}. Error: {e}")
            continue

    
    output_buffer = io.BytesIO()
    pdf_document.save(output_buffer)
    pdf_document.close()
    output_buffer.seek(0) 
    return send_file(
        output_buffer,
        as_attachment=True,
        download_name='edited_' + pdf_file.filename,
        mimetype='application/pdf'
    )

if __name__ == '__main__':
    
    app.run(debug=True, host='0.0.0.0', port=5000)

