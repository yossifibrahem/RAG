#!/usr/bin/env python3
"""
PDF to Text Extractor
A script to extract text from PDF files and save it to text files.
"""

import os
import argparse
from PyPDF2 import PdfReader

def extract_text_from_pdf(pdf_path):
    """
    Extract text from a PDF file using PyPDF2.
    
    Args:
        pdf_path (str): Path to the PDF file
    
    Returns:
        str: Extracted text from the PDF
    """
    text = ""
    try:
        # Open the PDF file
        with open(pdf_path, 'rb') as file:
            # Create a PDF reader object
            pdf = PdfReader(file)
            
            # Get the number of pages in the PDF
            num_pages = len(pdf.pages)
            
            # Extract text from each page
            for page_num in range(num_pages):
                page = pdf.pages[page_num]
                text += page.extract_text()
                text += "\n\n"  # Add space between pages
                
        return text
    
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None

def save_text_to_file(text, output_path):
    """
    Save extracted text to a file.
    
    Args:
        text (str): Text to save
        output_path (str): Path to save the text file
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        with open(output_path, 'w', encoding='utf-8') as file:
            file.write(text)
        return True
    
    except Exception as e:
        print(f"Error saving text to file: {e}")
        return False

def main():
    # Set up command line arguments
    parser = argparse.ArgumentParser(description='Extract text from PDF files and save to text files.')
    parser.add_argument('pdf_path', help='Path to the PDF file')
    parser.add_argument('-o', '--output', help='Output text file path (default: same name as PDF with .txt extension)')
    
    # Parse arguments
    args = parser.parse_args()
    
    # Set default output path if not specified
    if not args.output:
        base_name = os.path.splitext(args.pdf_path)[0]
        args.output = f"{base_name}.txt"
    
    # Extract text from PDF
    print(f"Extracting text from: {args.pdf_path}")
    extracted_text = extract_text_from_pdf(args.pdf_path)
    
    if extracted_text:
        # Save text to file
        if save_text_to_file(extracted_text, args.output):
            print(f"Text successfully saved to: {args.output}")
        else:
            print("Failed to save text to file.")
    else:
        print("Text extraction failed.")

if __name__ == "__main__":
    main()