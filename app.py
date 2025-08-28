import fitz  # PyMuPDF
from flask import Flask, request, send_file
from flask_cors import CORS
import json
import io

# Initialize the Flask application
app = Flask(__name__)
# Enable Cross-Origin Resource Sharing (CORS) to allow browser requests
CORS(app)

@app.route('/edit-pdf', methods=['POST'])
def edit_pdf():
    """
    API endpoint to edit a PDF file.
    Expects a POST request with a 'pdf' file and 'edits' data.
    """
    # Check if the pdf file is in the request
    if 'pdf' not in request.files:
        return "No PDF file provided", 400

    # Check if the edits data is in the request
    if 'edits' not in request.form:
        return "No edits data provided", 400

    pdf_file = request.files['pdf']
    edits_json = request.form['edits']
    
    try:
        # Load the edits from the JSON string
        edits = json.loads(edits_json)
    except json.JSONDecodeError:
        return "Invalid JSON format for edits", 400

    # Read the PDF file into memory
    pdf_bytes = pdf_file.read()
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")

    # Process each edit
    for edit in edits:
        try:
            page_index = int(edit['pageIndex'])
            new_text = edit['newText']
            # The rectangle [x1, y1, x2, y2] where the original text was
            rect_coords = edit['rect'] 
            
            # Ensure the page index is valid
            if 0 <= page_index < len(pdf_document):
                page = pdf_document[page_index]
                
                # Create a fitz.Rect object from the coordinates
                rect = fitz.Rect(rect_coords['x'], rect_coords['y'], rect_coords['x'] + rect_coords['width'], rect_coords['y'] + rect_coords['height'])

                # 1. Add a redaction annotation to cover the old text.
                # We make it white to "erase" the text.
                redaction = page.add_redact_annot(rect, fill=(1, 1, 1)) # (1,1,1) is RGB for white
                # Applying the redaction immediately removes the content underneath
                page.apply_redactions()

                # 2. Insert the new text.
                # We use a textbox to handle potential text wrapping.
                # The font size is approximated; for more accuracy, this could be sent from the frontend.
                font_size = edit.get('fontSize', 10) 
                page.insert_textbox(rect, new_text, fontsize=font_size, fontname="helv", color=(0, 0, 0))

        except (KeyError, ValueError, TypeError) as e:
            print(f"Skipping invalid edit object: {edit}. Error: {e}")
            continue

    # Save the modified PDF to a memory buffer
    output_buffer = io.BytesIO()
    pdf_document.save(output_buffer)
    pdf_document.close()
    output_buffer.seek(0) # Rewind the buffer to the beginning

    # Send the modified PDF back to the client
    return send_file(
        output_buffer,
        as_attachment=True,
        download_name='edited_' + pdf_file.filename,
        mimetype='application/pdf'
    )

if __name__ == '__main__':
    # Run the Flask app on host 0.0.0.0 to be accessible from the network
    app.run(debug=True, host='0.0.0.0', port=5000)

